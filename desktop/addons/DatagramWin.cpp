#include <napi.h>
#include <windows.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Networking.h>
#include <winrt/Windows.Networking.Sockets.h>
#include <winrt/Windows.Storage.Streams.h>
#include <string>
#include <mutex>
#include <vector>

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Networking;
using namespace Windows::Networking::Sockets;
using namespace Windows::Storage::Streams;

/**
 * WinRT DatagramSocket wrapper for Node.js.
 *
 * Uses Windows.Networking.Sockets.DatagramSocket which respects
 * MSIX AppContainer network capabilities (internetClientServer,
 * privateNetworkClientServer) unlike Win32 Winsock (Node.js dgram).
 *
 * Exposes:
 *   createSocket() -> handle
 *   bind(handle, port?) -> { address, family, port }
 *   send(handle, data, port, address) -> void
 *   close(handle) -> void
 *   address(handle) -> { address, family, port }
 *
 * Events via ThreadSafeFunction:
 *   onMessage(msg: Buffer, rinfo: { address, family, port })
 *   onError(err: string)
 *   onClose()
 */

struct SocketEntry
{
    DatagramSocket socket{nullptr};
    Napi::ThreadSafeFunction tsfn;
    event_token messageToken;
    std::string localAddress;
    std::string localFamily;
    int localPort = 0;
    bool isBound = false;
    bool isClosed = false;
    std::mutex mu;

    // Cached output streams per remote endpoint ("address:port" → stream)
    std::unordered_map<std::string, IOutputStream> outputStreams;
    std::mutex streamMu;

    IOutputStream getOrCreateStream(const HostName &host, const hstring &port, const std::string &key)
    {
        std::lock_guard<std::mutex> lock(streamMu);
        auto it = outputStreams.find(key);
        if (it != outputStreams.end())
            return it->second;

        auto streamOp = socket.GetOutputStreamAsync(host, port);
        streamOp.get();
        auto stream = streamOp.GetResults();
        outputStreams[key] = stream;
        return stream;
    }

    void clearStreams()
    {
        std::lock_guard<std::mutex> lock(streamMu);
        outputStreams.clear();
    }
};

static std::mutex globalMu;
static uint32_t nextHandle = 1;
static std::unordered_map<uint32_t, std::shared_ptr<SocketEntry>> sockets;

static std::shared_ptr<SocketEntry> GetSocket(uint32_t handle)
{
    std::lock_guard<std::mutex> lock(globalMu);
    auto it = sockets.find(handle);
    if (it != sockets.end())
        return it->second;
    return nullptr;
}

static void RemoveSocket(uint32_t handle)
{
    std::lock_guard<std::mutex> lock(globalMu);
    sockets.erase(handle);
}

// ── Event data structs ──────────────────────────────────────────────

struct MessageEventData
{
    std::vector<uint8_t> buffer;
    std::string address;
    std::string family;
    int port;
};

struct ErrorEventData
{
    std::string message;
};

struct CloseEventData
{
};

struct EventData
{
    enum Type
    {
        Message,
        Error,
        Close
    } type;
    MessageEventData msg;
    ErrorEventData err;
};

static void CallJS(Napi::Env env, Napi::Function callback, EventData *data)
{
    if (!data)
        return;

    try
    {
        switch (data->type)
        {
        case EventData::Message:
        {
            auto buf = Napi::Buffer<uint8_t>::Copy(env, data->msg.buffer.data(), data->msg.buffer.size());
            auto rinfo = Napi::Object::New(env);
            rinfo.Set("address", data->msg.address);
            rinfo.Set("family", data->msg.family);
            rinfo.Set("port", data->msg.port);
            callback.Call({Napi::String::New(env, "message"), buf, rinfo});
            break;
        }
        case EventData::Error:
        {
            callback.Call({Napi::String::New(env, "error"), Napi::String::New(env, data->err.message)});
            break;
        }
        case EventData::Close:
        {
            callback.Call({Napi::String::New(env, "close")});
            break;
        }
        }
    }
    catch (...)
    {
    }

    delete data;
}

// ── Helpers ─────────────────────────────────────────────────────────

static std::string WideToUtf8(const std::wstring &wstr)
{
    if (wstr.empty())
        return {};
    int size = WideCharToMultiByte(CP_UTF8, 0, wstr.data(), (int)wstr.size(), nullptr, 0, nullptr, nullptr);
    std::string out(size, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.data(), (int)wstr.size(), &out[0], size, nullptr, nullptr);
    return out;
}

// ── createSocket(callback) → handle ─────────────────────────────────

Napi::Value CreateSocket(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsFunction())
    {
        Napi::TypeError::New(env, "Expected callback function").ThrowAsJavaScriptException();
        return env.Null();
    }

    try
    {
        auto entry = std::make_shared<SocketEntry>();
        entry->socket = DatagramSocket();

        // Create thread-safe function for callbacks
        entry->tsfn = Napi::ThreadSafeFunction::New(
            env,
            info[0].As<Napi::Function>(),
            "DatagramWinCallback",
            0,               // unlimited queue
            1,               // one thread
            [](Napi::Env) {} // weak so the event-loop can exit
        );
        entry->tsfn.Unref(env); // Allow process to exit even if socket hasn't been cleaned up

        // Capture a weak_ptr so that the C++/WinRT lambda doesn't prevent cleanup
        std::weak_ptr<SocketEntry> weak = entry;

        entry->messageToken = entry->socket.MessageReceived(
            [weak](DatagramSocket const &, DatagramSocketMessageReceivedEventArgs const &args)
            {
                auto sp = weak.lock();
                if (!sp || sp->isClosed)
                    return;

                try
                {
                    auto reader = args.GetDataReader();
                    uint32_t len = reader.UnconsumedBufferLength();

                    auto *evt = new EventData();
                    evt->type = EventData::Message;
                    evt->msg.buffer.resize(len);
                    if (len > 0)
                    {
                        // Read bytes into our vector
                        for (uint32_t i = 0; i < len; ++i)
                            evt->msg.buffer[i] = reader.ReadByte();
                    }

                    auto remoteAddress = args.RemoteAddress();
                    auto remotePort = args.RemotePort();
                    evt->msg.address = WideToUtf8(std::wstring(remoteAddress.CanonicalName()));
                    evt->msg.family = "IPv4";
                    evt->msg.port = std::stoi(WideToUtf8(std::wstring(remotePort)));

                    sp->tsfn.BlockingCall(evt, CallJS);
                }
                catch (...)
                {
                }
            });

        uint32_t handle;
        {
            std::lock_guard<std::mutex> lock(globalMu);
            handle = nextHandle++;
            sockets[handle] = entry;
        }

        return Napi::Number::New(env, handle);
    }
    catch (const hresult_error &e)
    {
        Napi::Error::New(env, "WinRT error: " + WideToUtf8(e.message().c_str())).ThrowAsJavaScriptException();
        return env.Null();
    }
    catch (const std::exception &e)
    {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

// ── bind(handle, port?) → { address, family, port } ────────────────

Napi::Value Bind(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber())
    {
        Napi::TypeError::New(env, "Expected handle").ThrowAsJavaScriptException();
        return env.Null();
    }

    uint32_t handle = info[0].As<Napi::Number>().Uint32Value();
    auto entry = GetSocket(handle);
    if (!entry)
    {
        Napi::Error::New(env, "Invalid socket handle").ThrowAsJavaScriptException();
        return env.Null();
    }

    try
    {
        hstring servicePort = L"";
        if (info.Length() >= 2 && info[1].IsNumber())
        {
            int port = info[1].As<Napi::Number>().Int32Value();
            servicePort = to_hstring(port);
        }

        // BindServiceNameAsync binds to a port (empty string = OS-assigned)
        auto op = entry->socket.BindServiceNameAsync(servicePort);
        op.get(); // synchronous wait

        // Read back the actual bound port
        auto boundPort = entry->socket.Information().LocalPort();
        int port = std::stoi(WideToUtf8(std::wstring(boundPort)));

        entry->localAddress = "0.0.0.0";
        entry->localFamily = "IPv4";
        entry->localPort = port;
        entry->isBound = true;

        auto result = Napi::Object::New(env);
        result.Set("address", entry->localAddress);
        result.Set("family", entry->localFamily);
        result.Set("port", port);
        return result;
    }
    catch (const hresult_error &e)
    {
        Napi::Error::New(env, "Bind failed: " + WideToUtf8(e.message().c_str())).ThrowAsJavaScriptException();
        return env.Null();
    }
    catch (const std::exception &e)
    {
        Napi::Error::New(env, std::string("Bind failed: ") + e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

// ── send(handle, data, port, address) ──────────────────────────────

Napi::Value Send(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 4)
    {
        Napi::TypeError::New(env, "Expected (handle, data, port, address)").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    uint32_t handle = info[0].As<Napi::Number>().Uint32Value();
    auto entry = GetSocket(handle);
    if (!entry || entry->isClosed)
    {
        Napi::Error::New(env, "Socket is closed or invalid").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Get data
    uint8_t *dataPtr = nullptr;
    size_t dataLen = 0;
    if (info[1].IsBuffer())
    {
        auto buf = info[1].As<Napi::Buffer<uint8_t>>();
        dataPtr = buf.Data();
        dataLen = buf.Length();
    }
    else if (info[1].IsTypedArray())
    {
        auto arr = info[1].As<Napi::TypedArray>();
        dataPtr = static_cast<uint8_t *>(arr.ArrayBuffer().Data()) + arr.ByteOffset();
        dataLen = arr.ByteLength();
    }
    else
    {
        Napi::TypeError::New(env, "Expected Buffer or Uint8Array for data").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    int port = info[2].As<Napi::Number>().Int32Value();
    std::string address = info[3].As<Napi::String>().Utf8Value();

    try
    {
        std::string key = address + ":" + std::to_string(port);
        HostName remoteHost(to_hstring(address));
        hstring remotePort = to_hstring(port);

        // Get cached output stream or create one (avoids repeated async calls)
        auto outputStream = entry->getOrCreateStream(remoteHost, remotePort, key);

        DataWriter writer(outputStream);
        // Write raw bytes directly from pointer (no copy)
        writer.WriteBytes(winrt::array_view<const uint8_t>(dataPtr, dataPtr + dataLen));

        writer.StoreAsync().get();

        // Detach so DataWriter doesn't close the cached stream
        writer.DetachStream();

        return env.Undefined();
    }
    catch (const hresult_error &e)
    {
        std::weak_ptr<SocketEntry> weak = entry;
        auto sp = weak.lock();
        if (sp && sp->tsfn)
        {
            auto *evt = new EventData();
            evt->type = EventData::Error;
            evt->err.message = "Send failed: " + WideToUtf8(e.message().c_str());
            sp->tsfn.BlockingCall(evt, CallJS);
        }
        return env.Undefined();
    }
    catch (const std::exception &e)
    {
        Napi::Error::New(env, std::string("Send failed: ") + e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

// ── address(handle) → { address, family, port } ────────────────────

Napi::Value Address(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    uint32_t handle = info[0].As<Napi::Number>().Uint32Value();
    auto entry = GetSocket(handle);
    if (!entry)
    {
        Napi::Error::New(env, "Invalid socket handle").ThrowAsJavaScriptException();
        return env.Null();
    }

    auto result = Napi::Object::New(env);
    result.Set("address", entry->localAddress);
    result.Set("family", entry->localFamily);
    result.Set("port", entry->localPort);
    return result;
}

// ── close(handle) ──────────────────────────────────────────────────

Napi::Value Close(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    uint32_t handle = info[0].As<Napi::Number>().Uint32Value();
    auto entry = GetSocket(handle);
    if (!entry)
        return env.Undefined();

    {
        std::lock_guard<std::mutex> lock(entry->mu);
        if (entry->isClosed)
            return env.Undefined();
        entry->isClosed = true;
    }

    // Clear cached output streams
    entry->clearStreams();

    try
    {
        // Unregister event handler
        entry->socket.MessageReceived(entry->messageToken);
    }
    catch (...)
    {
    }

    try
    {
        // Close the WinRT socket (IClosable)
        entry->socket.Close();
    }
    catch (...)
    {
    }

    // Notify JS of close
    try
    {
        auto *evt = new EventData();
        evt->type = EventData::Close;
        entry->tsfn.BlockingCall(evt, CallJS);
    }
    catch (...)
    {
    }

    try
    {
        entry->tsfn.Release();
    }
    catch (...)
    {
    }

    RemoveSocket(handle);

    return env.Undefined();
}

// ── Module init ─────────────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("createSocket", Napi::Function::New(env, CreateSocket));
    exports.Set("bind", Napi::Function::New(env, Bind));
    exports.Set("send", Napi::Function::New(env, Send));
    exports.Set("address", Napi::Function::New(env, Address));
    exports.Set("close", Napi::Function::New(env, Close));
    return exports;
}

NODE_API_MODULE(DatagramWin, Init)
