#include <napi.h>
#include <windows.h>
#include <windns.h>
#include <string>
#include <vector>
#include <map>
#include <mutex>
#include <set>

// ============================================================================
// String conversion helpers
// ============================================================================

static std::string WideToUtf8(const wchar_t *wide)
{
    if (!wide || !wide[0])
        return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, wide, -1, nullptr, 0, nullptr, nullptr);
    if (size <= 0)
        return "";
    std::string utf8(size - 1, 0);
    WideCharToMultiByte(CP_UTF8, 0, wide, -1, &utf8[0], size, nullptr, nullptr);
    return utf8;
}

static std::wstring Utf8ToWide(const std::string &utf8)
{
    if (utf8.empty())
        return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, nullptr, 0);
    if (size <= 0)
        return L"";
    std::wstring wide(size - 1, 0);
    MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, &wide[0], size);
    return wide;
}

static std::string Ip4ToString(DWORD ip)
{
    unsigned char *b = (unsigned char *)&ip;
    char buf[16];
    snprintf(buf, sizeof(buf), "%u.%u.%u.%u", b[0], b[1], b[2], b[3]);
    return buf;
}

// ============================================================================
// Data structures
// ============================================================================

// Service data passed from resolve callback to JS thread via TSFN
struct ServiceData
{
    std::string name;
    std::string host;
    std::vector<std::string> addresses;
    uint16_t port;
    std::map<std::string, std::string> txt;
};

// Context for an in-flight resolve operation
struct ResolveContext
{
    wchar_t *queryName;
    DNS_SERVICE_CANCEL cancel;

    ResolveContext(const wchar_t *name)
    {
        size_t len = wcslen(name) + 1;
        queryName = new wchar_t[len];
        wcscpy_s(queryName, len, name);
        ZeroMemory(&cancel, sizeof(cancel));
    }

    ~ResolveContext()
    {
        delete[] queryName;
    }
};

// Registration state machine
enum class RegState
{
    IDLE,
    REGISTERING,
    REGISTERED,
    DEREGISTERING
};

// ============================================================================
// Global state
// ============================================================================

// Browse state
static Napi::ThreadSafeFunction browseTsfn;
static DNS_SERVICE_CANCEL browseCancel;
static bool isBrowsing = false;
static std::mutex browseMutex;
static std::wstring browseQueryName; // kept alive for the duration of browse
static std::set<ResolveContext *> activeResolves;

// Register state
static PDNS_SERVICE_INSTANCE registeredInstance = nullptr;
static DNS_SERVICE_REGISTER_REQUEST registerReq;
static RegState regState = RegState::IDLE;
static std::mutex registerMutex;
// Keep wide strings alive for the lifetime of the registration
static std::wstring regInstanceName;
static std::wstring regHostName;
static std::vector<std::wstring> regKeyStrs;
static std::vector<std::wstring> regValueStrs;

// Forward declarations
static void WINAPI BrowseCallback(DWORD Status, PVOID pQueryContext, PDNS_RECORD pDnsRecord);
static void WINAPI ResolveCallback(DWORD Status, PVOID pQueryContext, PDNS_SERVICE_INSTANCE pInstance);
static void WINAPI RegisterCallback(DWORD Status, PVOID pQueryContext, PDNS_SERVICE_INSTANCE pInstance);

// ============================================================================
// JS thread callback for TSFN — converts ServiceData to JS objects
// ============================================================================

static void CallJSBrowseCallback(Napi::Env env, Napi::Function jsCallback, ServiceData *data)
{
    if (!data)
        return;

    Napi::Object result = Napi::Object::New(env);
    result.Set("name", data->name);
    result.Set("host", data->host);
    result.Set("port", Napi::Number::New(env, data->port));

    Napi::Array addresses = Napi::Array::New(env, data->addresses.size());
    for (size_t i = 0; i < data->addresses.size(); i++)
    {
        addresses.Set(static_cast<uint32_t>(i), data->addresses[i]);
    }
    result.Set("addresses", addresses);

    Napi::Object txt = Napi::Object::New(env);
    for (const auto &kv : data->txt)
    {
        txt.Set(kv.first, kv.second);
    }
    result.Set("txt", txt);

    jsCallback.Call({result});
    delete data;
}

// ============================================================================
// Resolve callback — fires on OS thread when a service instance is resolved
// ============================================================================

static void WINAPI ResolveCallback(DWORD Status, PVOID pQueryContext, PDNS_SERVICE_INSTANCE pInstance)
{
    ResolveContext *ctx = static_cast<ResolveContext *>(pQueryContext);

    // Remove from active set
    {
        std::lock_guard<std::mutex> lock(browseMutex);
        activeResolves.erase(ctx);
    }

    if (Status == ERROR_SUCCESS && pInstance)
    {
        ServiceData *data = new ServiceData();

        if (pInstance->pszInstanceName)
            data->name = WideToUtf8(pInstance->pszInstanceName);
        if (pInstance->pszHostName)
            data->host = WideToUtf8(pInstance->pszHostName);
        data->port = pInstance->wPort;

        // IPv4 address
        if (pInstance->ip4Address)
            data->addresses.push_back(Ip4ToString(*pInstance->ip4Address));

        // TXT key=value records
        for (DWORD i = 0; i < pInstance->dwPropertyCount; i++)
        {
            std::string key = pInstance->keys[i] ? WideToUtf8(pInstance->keys[i]) : "";
            std::string value = pInstance->values[i] ? WideToUtf8(pInstance->values[i]) : "";
            if (!key.empty())
                data->txt[key] = value;
        }

        // Marshal to JS thread under lock to prevent use-after-release of TSFN
        {
            std::lock_guard<std::mutex> lock(browseMutex);
            if (isBrowsing)
            {
                browseTsfn.NonBlockingCall(data, CallJSBrowseCallback);
            }
            else
            {
                delete data;
            }
        }
    }

    if (pInstance)
        DnsServiceFreeInstance(pInstance);

    delete ctx;
}

// ============================================================================
// Browse callback — fires on OS thread when PTR records are discovered
// ============================================================================

static void WINAPI BrowseCallback(DWORD Status, PVOID pQueryContext, PDNS_RECORD pDnsRecord)
{
    if (!isBrowsing || Status != ERROR_SUCCESS || !pDnsRecord)
    {
        if (pDnsRecord)
            DnsRecordListFree(pDnsRecord, DnsFreeRecordList);
        return;
    }

    // Walk records — look for PTR records pointing to service instance names
    for (PDNS_RECORD pRecord = pDnsRecord; pRecord; pRecord = pRecord->pNext)
    {
        if (pRecord->wType == DNS_TYPE_PTR && pRecord->Data.PTR.pNameHost)
        {
            const wchar_t *instanceName = pRecord->Data.PTR.pNameHost;

            ResolveContext *resolveCtx = new ResolveContext(instanceName);

            {
                std::lock_guard<std::mutex> lock(browseMutex);
                if (!isBrowsing)
                {
                    delete resolveCtx;
                    break;
                }
                activeResolves.insert(resolveCtx);
            }

            // Resolve this instance to get host/port/txt
            DNS_SERVICE_RESOLVE_REQUEST resolveReq = {};
            resolveReq.Version = DNS_QUERY_REQUEST_VERSION1;
            resolveReq.InterfaceIndex = 0;
            resolveReq.QueryName = resolveCtx->queryName;
            resolveReq.pResolveCompletionCallback = ResolveCallback;
            resolveReq.pQueryContext = resolveCtx;

            DNS_STATUS status = DnsServiceResolve(&resolveReq, &resolveCtx->cancel);
            if (status != DNS_REQUEST_PENDING)
            {
                std::lock_guard<std::mutex> lock(browseMutex);
                activeResolves.erase(resolveCtx);
                delete resolveCtx;
            }
        }
    }

    DnsRecordListFree(pDnsRecord, DnsFreeRecordList);
}

// ============================================================================
// Register / deregister callback
// ============================================================================

static void WINAPI RegisterCallback(DWORD Status, PVOID pQueryContext, PDNS_SERVICE_INSTANCE pInstance)
{
    std::lock_guard<std::mutex> lock(registerMutex);

    // Free the copy the OS provides
    if (pInstance)
        DnsServiceFreeInstance(pInstance);

    if (regState == RegState::REGISTERING)
    {
        if (Status == ERROR_SUCCESS)
        {
            regState = RegState::REGISTERED;
        }
        else
        {
            regState = RegState::IDLE;
            if (registeredInstance)
            {
                DnsServiceFreeInstance(registeredInstance);
                registeredInstance = nullptr;
            }
        }
    }
    else if (regState == RegState::DEREGISTERING)
    {
        regState = RegState::IDLE;
        if (registeredInstance)
        {
            DnsServiceFreeInstance(registeredInstance);
            registeredInstance = nullptr;
        }
    }
}

// ============================================================================
// JS-facing functions
// ============================================================================

/**
 * startBrowse(queryName: string, callback: (service) => void): void
 *
 * queryName — e.g. "_homecloud._tcp.local"
 * callback  — invoked for each resolved service with { name, host, addresses, port, txt }
 */
Napi::Value StartBrowse(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction())
    {
        Napi::TypeError::New(env, "Expected (queryName: string, callback: Function)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // If already browsing, stop first
    if (isBrowsing)
    {
        std::lock_guard<std::mutex> lock(browseMutex);
        isBrowsing = false;
        browseTsfn.Release();
    }

    std::string queryNameUtf8 = info[0].As<Napi::String>().Utf8Value();
    Napi::Function callback = info[1].As<Napi::Function>();

    // Keep the wide string alive for the whole browse session
    browseQueryName = Utf8ToWide(queryNameUtf8);

    browseTsfn = Napi::ThreadSafeFunction::New(
        env,
        callback,
        "DnsServiceBrowseCallback",
        0, // unlimited queue
        1  // initial thread count
    );

    ZeroMemory(&browseCancel, sizeof(browseCancel));

    DNS_SERVICE_BROWSE_REQUEST browseReq = {};
    browseReq.Version = DNS_QUERY_REQUEST_VERSION1;
    browseReq.InterfaceIndex = 0; // all interfaces
    browseReq.QueryName = browseQueryName.c_str();
    browseReq.pBrowseCallback = BrowseCallback;
    browseReq.pQueryContext = nullptr;

    isBrowsing = true;

    DNS_STATUS status = DnsServiceBrowse(&browseReq, &browseCancel);
    if (status != DNS_REQUEST_PENDING)
    {
        isBrowsing = false;
        browseTsfn.Release();
        Napi::Error::New(env, "DnsServiceBrowse failed with status " + std::to_string(status))
            .ThrowAsJavaScriptException();
    }

    return env.Undefined();
}

/**
 * stopBrowse(): void
 */
Napi::Value StopBrowse(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    std::lock_guard<std::mutex> lock(browseMutex);
    if (isBrowsing)
    {
        isBrowsing = false;
        browseTsfn.Release();
    }

    return env.Undefined();
}

/**
 * registerService(instanceName: string, hostname: string, port: number, txt: object): void
 *
 * instanceName — full FQDN, e.g. "MyDevice._homecloud._tcp.local"
 * hostname     — host name, e.g. "DESKTOP-ABC123.local"
 * port         — TCP port number
 * txt          — key-value object of TXT records
 */
Napi::Value RegisterService(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 4 || !info[0].IsString() || !info[1].IsString() ||
        !info[2].IsNumber() || !info[3].IsObject())
    {
        Napi::TypeError::New(env, "Expected (instanceName: string, hostname: string, port: number, txt: object)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Deregister first if already registered
    {
        std::lock_guard<std::mutex> lock(registerMutex);
        if (regState == RegState::REGISTERED && registeredInstance)
        {
            regState = RegState::DEREGISTERING;
            DnsServiceDeRegister(&registerReq, nullptr);
            // Wait is not necessary — old registration will be cleaned up by the callback
        }
    }

    regInstanceName = Utf8ToWide(info[0].As<Napi::String>().Utf8Value());
    regHostName = Utf8ToWide(info[1].As<Napi::String>().Utf8Value());
    uint16_t port = static_cast<uint16_t>(info[2].As<Napi::Number>().Uint32Value());

    // Extract TXT records
    Napi::Object txtObj = info[3].As<Napi::Object>();
    Napi::Array propNames = txtObj.GetPropertyNames();
    DWORD propCount = propNames.Length();

    regKeyStrs.clear();
    regValueStrs.clear();
    regKeyStrs.resize(propCount);
    regValueStrs.resize(propCount);
    std::vector<PCWSTR> keyPtrs(propCount);
    std::vector<PCWSTR> valuePtrs(propCount);

    for (DWORD i = 0; i < propCount; i++)
    {
        std::string key = propNames.Get(i).As<Napi::String>().Utf8Value();
        std::string value = txtObj.Get(key).As<Napi::String>().Utf8Value();
        regKeyStrs[i] = Utf8ToWide(key);
        regValueStrs[i] = Utf8ToWide(value);
        keyPtrs[i] = regKeyStrs[i].c_str();
        valuePtrs[i] = regValueStrs[i].c_str();
    }

    registeredInstance = DnsServiceConstructInstance(
        regInstanceName.c_str(),
        regHostName.c_str(),
        nullptr, // ip4 — OS determines from hostname
        nullptr, // ip6
        port,
        0, // priority
        0, // weight
        propCount,
        propCount > 0 ? keyPtrs.data() : nullptr,
        propCount > 0 ? valuePtrs.data() : nullptr);

    if (!registeredInstance)
    {
        Napi::Error::New(env, "DnsServiceConstructInstance failed").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    ZeroMemory(&registerReq, sizeof(registerReq));
    registerReq.Version = DNS_QUERY_REQUEST_VERSION1;
    registerReq.InterfaceIndex = 0;
    registerReq.pServiceInstance = registeredInstance;
    registerReq.pRegisterCompletionCallback = RegisterCallback;
    registerReq.pQueryContext = nullptr;
    registerReq.unicastEnabled = FALSE; // Use mDNS multicast

    {
        std::lock_guard<std::mutex> lock(registerMutex);
        regState = RegState::REGISTERING;
    }

    DNS_STATUS status = DnsServiceRegister(&registerReq, nullptr);
    if (status != DNS_REQUEST_PENDING)
    {
        std::lock_guard<std::mutex> lock(registerMutex);
        regState = RegState::IDLE;
        DnsServiceFreeInstance(registeredInstance);
        registeredInstance = nullptr;
        Napi::Error::New(env, "DnsServiceRegister failed with status " + std::to_string(status))
            .ThrowAsJavaScriptException();
    }

    return env.Undefined();
}

/**
 * deregisterService(): void
 */
Napi::Value DeregisterService(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    std::lock_guard<std::mutex> lock(registerMutex);
    if (regState == RegState::REGISTERED && registeredInstance)
    {
        regState = RegState::DEREGISTERING;
        DnsServiceDeRegister(&registerReq, nullptr);
    }

    return env.Undefined();
}

// ============================================================================
// Module init
// ============================================================================

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("startBrowse", Napi::Function::New(env, StartBrowse));
    exports.Set("stopBrowse", Napi::Function::New(env, StopBrowse));
    exports.Set("registerService", Napi::Function::New(env, RegisterService));
    exports.Set("deregisterService", Napi::Function::New(env, DeregisterService));
    return exports;
}

NODE_API_MODULE(DiscoveryWin, Init)
