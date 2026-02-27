/**
 * AppsWin.cpp
 *
 * Node N-API native addon for Windows remote-desktop functionality.
 *
 * Provides:
 *   - getInstalledApps()        → list installed apps from registry + shell
 *   - getRunningApps()          → list running GUI apps (EnumWindows)
 *   - getAppState(appId)        → running / focused state + windows
 *   - launchApp(appId)          → open app via ShellExecuteEx
 *   - quitApp(appId)            → close app via WM_CLOSE
 *   - getAppIcon(appId)         → extract icon as base64 PNG data URI
 *   - getWindows(appId?)        → visible windows (EnumWindows)
 *   - captureWindow(hwnd, tileSize, quality, sinceTimestamp, cb)
 *                               → tile-based JPEG capture via PrintWindow
 *   - performAction(payload)    → mouse / keyboard / window actions
 *   - clearWindowCache(hwnd)    → clear tile hash cache for a window
 *   - hasScreenRecordingPermission()  → always true on Windows
 *   - hasAccessibilityPermission()    → always true on Windows
 *   - requestScreenRecordingPermission()  → no-op
 *   - requestAccessibilityPermission()   → no-op
 *
 * Build requirements (binding.gyp libs):
 *   gdi32.lib, user32.lib, shell32.lib, gdiplus.lib, ole32.lib, dwmapi.lib
 */

#include <napi.h>
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <psapi.h>
#include <dwmapi.h>
#include <gdiplus.h>

#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <mutex>
#include <algorithm>
#include <cstring>
#include <cmath>

// PW_RENDERFULLCONTENT was added in Windows 8.1 but may be missing from older SDK headers
#ifndef PW_RENDERFULLCONTENT
#define PW_RENDERFULLCONTENT 0x00000002
#endif

#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "gdiplus.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "psapi.lib")
#pragma comment(lib, "shlwapi.lib")

// ──────────────────────────────────────────────
// GDI+ lifetime (thread-safe initialization)
// ──────────────────────────────────────────────
static ULONG_PTR g_gdiplusToken = 0;
static std::once_flag g_gdiplusOnce;

static void EnsureGdiPlus() {
    std::call_once(g_gdiplusOnce, []() {
        Gdiplus::GdiplusStartupInput input;
        Gdiplus::GdiplusStartup(&g_gdiplusToken, &input, nullptr);
    });
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

static std::string WideToUtf8(const std::wstring &wstr) {
    if (wstr.empty()) return {};
    int size = WideCharToMultiByte(CP_UTF8, 0, wstr.data(), (int)wstr.size(),
                                   nullptr, 0, nullptr, nullptr);
    std::string out(size, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.data(), (int)wstr.size(),
                        &out[0], size, nullptr, nullptr);
    return out;
}

static std::wstring Utf8ToWide(const std::string &str) {
    if (str.empty()) return {};
    int size = MultiByteToWideChar(CP_UTF8, 0, str.data(), (int)str.size(), nullptr, 0);
    std::wstring out(size, 0);
    MultiByteToWideChar(CP_UTF8, 0, str.data(), (int)str.size(), &out[0], size);
    return out;
}

// Base64 encoding table
static const char b64Table[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static std::string Base64Encode(const std::vector<BYTE> &data) {
    std::string out;
    out.reserve(((data.size() + 2) / 3) * 4);
    for (size_t i = 0; i < data.size(); i += 3) {
        uint32_t n = ((uint32_t)data[i]) << 16;
        if (i + 1 < data.size()) n |= ((uint32_t)data[i + 1]) << 8;
        if (i + 2 < data.size()) n |= (uint32_t)data[i + 2];
        out.push_back(b64Table[(n >> 18) & 0x3F]);
        out.push_back(b64Table[(n >> 12) & 0x3F]);
        out.push_back((i + 1 < data.size()) ? b64Table[(n >> 6) & 0x3F] : '=');
        out.push_back((i + 2 < data.size()) ? b64Table[n & 0x3F] : '=');
    }
    return out;
}

// Get CLSID for an image encoder (e.g., "image/jpeg", "image/png")
static bool GetEncoderClsid(const WCHAR *format, CLSID *pClsid) {
    UINT numEncoders = 0, size = 0;
    Gdiplus::GetImageEncodersSize(&numEncoders, &size);
    if (size == 0) return false;
    std::vector<BYTE> buf(size);
    auto *encoders = reinterpret_cast<Gdiplus::ImageCodecInfo *>(buf.data());
    Gdiplus::GetImageEncoders(numEncoders, size, encoders);
    for (UINT i = 0; i < numEncoders; i++) {
        if (wcscmp(encoders[i].MimeType, format) == 0) {
            *pClsid = encoders[i].Clsid;
            return true;
        }
    }
    return false;
}

// Get executable path for a process
static std::wstring GetProcessExePath(DWORD pid) {
    std::wstring path;
    HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (hProcess) {
        WCHAR buf[MAX_PATH];
        DWORD size = MAX_PATH;
        if (QueryFullProcessImageNameW(hProcess, 0, buf, &size)) {
            path = buf;
        }
        CloseHandle(hProcess);
    }
    return path;
}

// Get PID for a window
static DWORD GetWindowPID(HWND hwnd) {
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    return pid;
}

// Check if HWND is a real visible app window (not tooltips, etc.)
static bool IsAppWindow(HWND hwnd) {
    if (!IsWindowVisible(hwnd)) return false;
    if (GetWindow(hwnd, GW_OWNER) != nullptr) return false; // Owned popup

    LONG_PTR exStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if (exStyle & WS_EX_TOOLWINDOW) return false;

    // Check for DWM cloaked (invisible UWP windows)
    BOOL cloaked = FALSE;
    DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &cloaked, sizeof(cloaked));
    if (cloaked) return false;

    // Must have non-zero dimensions
    RECT rect;
    if (!GetWindowRect(hwnd, &rect)) return false;
    if (rect.right - rect.left < 50 || rect.bottom - rect.top < 50) return false;

    return true;
}

// ──────────────────────────────────────────────
// Tile hash cache for delta capture
// ──────────────────────────────────────────────
struct TileHashCache {
    std::unordered_map<uint64_t, uint64_t> hashes; // key = (col<<32|row), value = hash
    int lastWidth = 0;
    int lastHeight = 0;
};

static std::mutex g_cacheMutex;
static std::unordered_map<uintptr_t, TileHashCache> g_windowCaches; // HWND → cache

// ──────────────────────────────────────────────
// Per-process info structure for enumeration
// ──────────────────────────────────────────────
struct ProcessAppInfo {
    DWORD pid;
    std::wstring exePath;
    std::wstring name;
    std::vector<HWND> windows;
};

// ──────────────────────────────────────────────
// 1. Installed apps
// ──────────────────────────────────────────────

static void ReadAppsFromRegistryKey(HKEY rootKey, const WCHAR *subKey,
                                    std::vector<Napi::Object> &results,
                                    std::unordered_set<std::string> &seen,
                                    Napi::Env env) {
    HKEY hKey;
    if (RegOpenKeyExW(rootKey, subKey, 0, KEY_READ, &hKey) != ERROR_SUCCESS)
        return;

    DWORD numSubKeys = 0;
    RegQueryInfoKeyW(hKey, nullptr, nullptr, nullptr, &numSubKeys,
                     nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr);

    for (DWORD i = 0; i < numSubKeys; i++) {
        WCHAR keyName[256];
        DWORD keyNameSize = 256;
        if (RegEnumKeyExW(hKey, i, keyName, &keyNameSize, nullptr,
                          nullptr, nullptr, nullptr) != ERROR_SUCCESS)
            continue;

        HKEY hAppKey;
        if (RegOpenKeyExW(hKey, keyName, 0, KEY_READ, &hAppKey) != ERROR_SUCCESS)
            continue;

        WCHAR displayName[512] = {0};
        WCHAR installLocation[MAX_PATH] = {0};
        WCHAR displayIcon[MAX_PATH] = {0};
        DWORD systemComponent = 0;
        DWORD size;

        // Skip system components
        size = sizeof(systemComponent);
        RegQueryValueExW(hAppKey, L"SystemComponent", nullptr, nullptr,
                         (LPBYTE)&systemComponent, &size);
        if (systemComponent == 1) {
            RegCloseKey(hAppKey);
            continue;
        }

        size = sizeof(displayName);
        if (RegQueryValueExW(hAppKey, L"DisplayName", nullptr, nullptr,
                             (LPBYTE)displayName, &size) != ERROR_SUCCESS ||
            wcslen(displayName) == 0) {
            RegCloseKey(hAppKey);
            continue;
        }

        size = sizeof(installLocation);
        RegQueryValueExW(hAppKey, L"InstallLocation", nullptr, nullptr,
                         (LPBYTE)installLocation, &size);

        size = sizeof(displayIcon);
        RegQueryValueExW(hAppKey, L"DisplayIcon", nullptr, nullptr,
                         (LPBYTE)displayIcon, &size);

        std::string id = WideToUtf8(keyName);
        if (seen.count(id)) {
            RegCloseKey(hAppKey);
            continue;
        }
        seen.insert(id);

        Napi::Object obj = Napi::Object::New(env);
        obj.Set("name", WideToUtf8(displayName));
        obj.Set("id", id);

        // iconPath is the DisplayIcon value (usually path to exe or icon resource)
        std::wstring iconStr(displayIcon);
        if (!iconStr.empty()) {
            // Strip ",index" suffix if present — e.g., "C:\...\app.exe,0"
            auto comma = iconStr.find_last_of(L',');
            if (comma != std::wstring::npos) iconStr = iconStr.substr(0, comma);
            obj.Set("iconPath", WideToUtf8(iconStr));
        } else {
            obj.Set("iconPath", env.Null());
        }

        std::wstring loc(installLocation);
        obj.Set("location", loc.empty() ? WideToUtf8(iconStr) : WideToUtf8(loc));

        results.push_back(obj);
        RegCloseKey(hAppKey);
    }
    RegCloseKey(hKey);
}

static Napi::Value GetInstalledApps(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    std::vector<Napi::Object> results;
    std::unordered_set<std::string> seen;

    // Read from both HKLM and HKCU, 64-bit and 32-bit views
    ReadAppsFromRegistryKey(HKEY_LOCAL_MACHINE,
        L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        results, seen, env);
    ReadAppsFromRegistryKey(HKEY_LOCAL_MACHINE,
        L"SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        results, seen, env);
    ReadAppsFromRegistryKey(HKEY_CURRENT_USER,
        L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        results, seen, env);

    // Sort by name
    std::sort(results.begin(), results.end(),
        [&env](const Napi::Object &a, const Napi::Object &b) {
            return a.Get("name").As<Napi::String>().Utf8Value() <
                   b.Get("name").As<Napi::String>().Utf8Value();
        });

    Napi::Array arr = Napi::Array::New(env, results.size());
    for (size_t i = 0; i < results.size(); i++) {
        arr.Set((uint32_t)i, results[i]);
    }
    return arr;
}

// ──────────────────────────────────────────────
// 2. Running apps
// ──────────────────────────────────────────────

struct EnumRunningCtx {
    std::unordered_map<DWORD, ProcessAppInfo> procs;
    HWND foregroundHwnd;
};

static BOOL CALLBACK EnumRunningProc(HWND hwnd, LPARAM lParam) {
    if (!IsAppWindow(hwnd)) return TRUE;

    auto *ctx = reinterpret_cast<EnumRunningCtx *>(lParam);
    DWORD pid = GetWindowPID(hwnd);
    if (pid == 0) return TRUE;

    auto it = ctx->procs.find(pid);
    if (it == ctx->procs.end()) {
        ProcessAppInfo pInfo;
        pInfo.pid = pid;
        pInfo.exePath = GetProcessExePath(pid);
        if (pInfo.exePath.empty()) return TRUE; // can't access — skip

        // Extract name from exe path
        auto slash = pInfo.exePath.find_last_of(L'\\');
        pInfo.name = (slash != std::wstring::npos)
                         ? pInfo.exePath.substr(slash + 1)
                         : pInfo.exePath;
        // Remove .exe extension
        auto dot = pInfo.name.find_last_of(L'.');
        if (dot != std::wstring::npos) pInfo.name = pInfo.name.substr(0, dot);

        pInfo.windows.push_back(hwnd);
        ctx->procs[pid] = std::move(pInfo);
    } else {
        it->second.windows.push_back(hwnd);
    }
    return TRUE;
}

static Napi::Value GetRunningApps(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();

    EnumRunningCtx ctx;
    ctx.foregroundHwnd = GetForegroundWindow();
    EnumWindows(EnumRunningProc, (LPARAM)&ctx);

    Napi::Array arr = Napi::Array::New(env);
    uint32_t idx = 0;
    for (auto &[pid, pInfo] : ctx.procs) {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("name", WideToUtf8(pInfo.name));
        // Use exe path as the app ID on Windows
        obj.Set("id", WideToUtf8(pInfo.exePath));
        obj.Set("iconPath", WideToUtf8(pInfo.exePath));
        arr.Set(idx++, obj);
    }
    return arr;
}

// ──────────────────────────────────────────────
// 3. App state
// ──────────────────────────────────────────────

static Napi::Value GetAppState(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected appId string").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::wstring appId = Utf8ToWide(info[0].As<Napi::String>().Utf8Value());

    // Find process by exe path
    EnumRunningCtx ctx;
    ctx.foregroundHwnd = GetForegroundWindow();
    EnumWindows(EnumRunningProc, (LPARAM)&ctx);

    bool isRunning = false;
    bool isFocused = false;

    DWORD fgPid = 0;
    if (ctx.foregroundHwnd) {
        GetWindowThreadProcessId(ctx.foregroundHwnd, &fgPid);
    }

    Napi::Array windowsArr = Napi::Array::New(env);
    uint32_t wIdx = 0;

    for (auto &[pid, pInfo] : ctx.procs) {
        // Case-insensitive path comparison
        if (_wcsicmp(pInfo.exePath.c_str(), appId.c_str()) != 0) continue;
        isRunning = true;
        isFocused = (pid == fgPid);

        for (HWND hwnd : pInfo.windows) {
            WCHAR title[512] = {0};
            GetWindowTextW(hwnd, title, 512);

            Napi::Object wObj = Napi::Object::New(env);
            wObj.Set("id", std::to_string((uintptr_t)hwnd));
            wObj.Set("title", WideToUtf8(title));
            wObj.Set("isFocused", hwnd == ctx.foregroundHwnd);
            wObj.Set("isHidden", (bool)!IsWindowVisible(hwnd));
            wObj.Set("isMinimized", (bool)IsIconic(hwnd));
            wObj.Set("isMaximized", (bool)IsZoomed(hwnd));
            windowsArr.Set(wIdx++, wObj);
        }
        break;
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("isRunning", isRunning);
    result.Set("isFocused", isFocused);
    result.Set("windows", windowsArr);
    return result;
}

// ──────────────────────────────────────────────
// 4. Launch app
// ──────────────────────────────────────────────

static Napi::Value LaunchApp(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected appId string").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::wstring appId = Utf8ToWide(info[0].As<Napi::String>().Utf8Value());

    SHELLEXECUTEINFOW sei = {};
    sei.cbSize = sizeof(sei);
    sei.fMask = SEE_MASK_NOCLOSEPROCESS;
    sei.lpVerb = L"open";
    sei.lpFile = appId.c_str();
    sei.nShow = SW_SHOWNORMAL;

    if (!ShellExecuteExW(&sei)) {
        Napi::Error::New(env, "Failed to launch application").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (sei.hProcess) CloseHandle(sei.hProcess);
    return env.Undefined();
}

// ──────────────────────────────────────────────
// 5. Quit app
// ──────────────────────────────────────────────

static Napi::Value QuitApp(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected appId string").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::wstring appId = Utf8ToWide(info[0].As<Napi::String>().Utf8Value());

    // Find all windows for this process and send WM_CLOSE
    EnumRunningCtx ctx;
    ctx.foregroundHwnd = GetForegroundWindow();
    EnumWindows(EnumRunningProc, (LPARAM)&ctx);

    for (auto &[pid, pInfo] : ctx.procs) {
        if (_wcsicmp(pInfo.exePath.c_str(), appId.c_str()) != 0) continue;
        for (HWND hwnd : pInfo.windows) {
            PostMessageW(hwnd, WM_CLOSE, 0, 0);
        }
        break;
    }
    return env.Undefined();
}

// ──────────────────────────────────────────────
// 6. Get app icon
// ──────────────────────────────────────────────

static Napi::Value GetAppIcon(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected appId string").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::wstring appId = Utf8ToWide(info[0].As<Napi::String>().Utf8Value());
    EnsureGdiPlus();

    // Extract large icon from the executable
    HICON hIconLarge = nullptr;
    ExtractIconExW(appId.c_str(), 0, &hIconLarge, nullptr, 1);
    if (!hIconLarge) {
        // Fallback: SHGetFileInfo
        SHFILEINFOW sfi = {};
        SHGetFileInfoW(appId.c_str(), 0, &sfi, sizeof(sfi), SHGFI_ICON | SHGFI_LARGEICON);
        hIconLarge = sfi.hIcon;
    }
    if (!hIconLarge) return env.Null();

    // Convert HICON to HBITMAP via GDI+
    Gdiplus::Bitmap iconBmp(hIconLarge);
    DestroyIcon(hIconLarge);

    // Create a 64x64 target bitmap
    Gdiplus::Bitmap target(64, 64, PixelFormat32bppARGB);
    Gdiplus::Graphics g(&target);
    g.SetInterpolationMode(Gdiplus::InterpolationModeHighQualityBicubic);
    g.Clear(Gdiplus::Color(0, 0, 0, 0)); // transparent
    g.DrawImage(&iconBmp, 0, 0, 64, 64);

    // Save to PNG stream
    CLSID pngClsid;
    if (!GetEncoderClsid(L"image/png", &pngClsid)) return env.Null();

    IStream *pStream = nullptr;
    CreateStreamOnHGlobal(nullptr, TRUE, &pStream);
    if (!pStream) return env.Null();

    if (target.Save(pStream, &pngClsid, nullptr) != Gdiplus::Ok) {
        pStream->Release();
        return env.Null();
    }

    STATSTG stat;
    pStream->Stat(&stat, STATFLAG_NONAME);
    ULONG dataSize = (ULONG)stat.cbSize.QuadPart;
    std::vector<BYTE> pngData(dataSize);
    LARGE_INTEGER zero;
    zero.QuadPart = 0;
    pStream->Seek(zero, STREAM_SEEK_SET, nullptr);
    ULONG bytesRead = 0;
    pStream->Read(pngData.data(), dataSize, &bytesRead);
    pStream->Release();

    std::string b64 = Base64Encode(pngData);
    std::string dataUri = "data:image/png;base64," + b64;
    return Napi::String::New(env, dataUri);
}

// ──────────────────────────────────────────────
// 7. Get windows
// ──────────────────────────────────────────────

struct EnumWindowsCtx {
    Napi::Env env;
    std::wstring filterExePath; // empty = all
    HWND foregroundHwnd;
    std::vector<Napi::Object> windows;

    explicit EnumWindowsCtx(Napi::Env e) : env(e), foregroundHwnd(nullptr) {}
};

static BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam) {
    if (!IsAppWindow(hwnd)) return TRUE;

    auto *ctx = reinterpret_cast<EnumWindowsCtx *>(lParam);
    DWORD pid = GetWindowPID(hwnd);
    if (pid == 0) return TRUE;

    if (!ctx->filterExePath.empty()) {
        std::wstring exePath = GetProcessExePath(pid);
        if (_wcsicmp(exePath.c_str(), ctx->filterExePath.c_str()) != 0)
            return TRUE;
    }

    WCHAR title[512] = {0};
    GetWindowTextW(hwnd, title, 512);

    Napi::Object obj = Napi::Object::New(ctx->env);
    obj.Set("id", std::to_string((uintptr_t)hwnd));
    obj.Set("title", WideToUtf8(title));
    obj.Set("isFocused", hwnd == ctx->foregroundHwnd);
    obj.Set("isHidden", (bool)!IsWindowVisible(hwnd));
    obj.Set("isMinimized", (bool)IsIconic(hwnd));
    obj.Set("isMaximized", (bool)IsZoomed(hwnd));
    ctx->windows.push_back(obj);
    return TRUE;
}

static Napi::Value GetWindows(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();

    EnumWindowsCtx ctx(env);
    ctx.foregroundHwnd = GetForegroundWindow();

    if (info.Length() >= 1 && info[0].IsString()) {
        ctx.filterExePath = Utf8ToWide(info[0].As<Napi::String>().Utf8Value());
    }

    EnumWindows(EnumWindowsProc, (LPARAM)&ctx);

    Napi::Array arr = Napi::Array::New(env, ctx.windows.size());
    for (size_t i = 0; i < ctx.windows.size(); i++) {
        arr.Set((uint32_t)i, ctx.windows[i]);
    }
    return arr;
}

// ──────────────────────────────────────────────
// 8. Capture window — PrintWindow + tile-based delta
// ──────────────────────────────────────────────

class CaptureWorker : public Napi::AsyncWorker {
public:
    CaptureWorker(const Napi::Function &cb, HWND hwnd, int tileSize,
                  double quality, double sinceTimestamp)
        : Napi::AsyncWorker(cb), hwnd(hwnd), tileSize(tileSize),
          quality(quality), sinceTimestamp(sinceTimestamp) {}

    void Execute() override {
        if (!IsWindow(hwnd)) {
            SetError("Window no longer exists");
            return;
        }

        // Get window rect
        RECT rect;
        if (!GetWindowRect(hwnd, &rect)) {
            SetError("Failed to get window rect");
            return;
        }

        winX = rect.left;
        winY = rect.top;
        imgWidth = rect.right - rect.left;
        imgHeight = rect.bottom - rect.top;

        if (imgWidth <= 0 || imgHeight <= 0) {
            SetError("Window has zero dimensions");
            return;
        }

        // Create compatible DC and bitmap
        HDC hdcScreen = GetDC(nullptr);
        HDC hdcMem = CreateCompatibleDC(hdcScreen);
        HBITMAP hBitmap = CreateCompatibleBitmap(hdcScreen, imgWidth, imgHeight);
        HGDIOBJ hOld = SelectObject(hdcMem, hBitmap);
        ReleaseDC(nullptr, hdcScreen);

        // Use PrintWindow with PW_RENDERFULLCONTENT for best results
        BOOL captured = PrintWindow(hwnd, hdcMem, PW_RENDERFULLCONTENT);
        if (!captured) {
            // Fallback: try BitBlt
            HDC hdcWin = GetDC(hwnd);
            if (hdcWin) {
                BitBlt(hdcMem, 0, 0, imgWidth, imgHeight, hdcWin, 0, 0, SRCCOPY);
                ReleaseDC(hwnd, hdcWin);
                captured = TRUE;
            }
        }

        if (!captured) {
            SelectObject(hdcMem, hOld);
            DeleteObject(hBitmap);
            DeleteDC(hdcMem);
            SetError("Failed to capture window");
            return;
        }

        // Get raw pixel data for hashing
        BITMAPINFOHEADER bi = {};
        bi.biSize = sizeof(bi);
        bi.biWidth = imgWidth;
        bi.biHeight = -imgHeight; // top-down
        bi.biPlanes = 1;
        bi.biBitCount = 32;
        bi.biCompression = BI_RGB;

        int rowBytes = imgWidth * 4;
        std::vector<BYTE> pixels(rowBytes * imgHeight);
        int scanLines = GetDIBits(hdcMem, hBitmap, 0, imgHeight, pixels.data(),
                  (BITMAPINFO *)&bi, DIB_RGB_COLORS);

        // Clean up GDI resources before heavy processing
        SelectObject(hdcMem, hOld);
        DeleteObject(hBitmap);
        DeleteDC(hdcMem);

        if (scanLines == 0) {
            SetError("Failed to retrieve pixel data");
            return;
        }

        int cols = (imgWidth + tileSize - 1) / tileSize;
        int rows = (imgHeight + tileSize - 1) / tileSize;

        // ── Phase 1: Hash all tiles and diff against cache (under lock) ──
        struct PendingTile {
            int col, row, tileX, tileY, tw, th;
        };
        std::vector<PendingTile> changedTiles;

        {
            std::lock_guard<std::mutex> lock(g_cacheMutex);
            uintptr_t hwndKey = (uintptr_t)hwnd;
            TileHashCache &cache = g_windowCaches[hwndKey];

            // If dimensions changed, invalidate cache
            if (cache.lastWidth != imgWidth || cache.lastHeight != imgHeight) {
                cache.hashes.clear();
                cache.lastWidth = imgWidth;
                cache.lastHeight = imgHeight;
            }

            for (int row = 0; row < rows; row++) {
                for (int col = 0; col < cols; col++) {
                    int tileX = col * tileSize;
                    int tileY = row * tileSize;
                    int tw = (std::min)(tileSize, imgWidth - tileX);
                    int th = (std::min)(tileSize, imgHeight - tileY);

                    // FNV-1a hash of tile pixels
                    uint64_t tileHash = 14695981039346656037ULL;
                    for (int y = tileY; y < tileY + th; y++) {
                        const BYTE *rowPtr = pixels.data() + y * rowBytes + tileX * 4;
                        size_t tileRowBytes = tw * 4;
                        // 8-byte-at-a-time hashing
                        size_t chunks = tileRowBytes / 8;
                        const uint64_t *ptr64 = reinterpret_cast<const uint64_t *>(rowPtr);
                        for (size_t c = 0; c < chunks; c++) {
                            tileHash ^= ptr64[c];
                            tileHash *= 1099511628211ULL;
                        }
                        // Remaining bytes
                        for (size_t b = chunks * 8; b < tileRowBytes; b++) {
                            tileHash ^= rowPtr[b];
                            tileHash *= 1099511628211ULL;
                        }
                    }

                    uint64_t key = ((uint64_t)col << 32) | (uint64_t)row;
                    auto it = cache.hashes.find(key);
                    bool changed = (it == cache.hashes.end()) || (it->second != tileHash);

                    if (sinceTimestamp > 0 && !changed) continue;
                    cache.hashes[key] = tileHash;

                    changedTiles.push_back({col, row, tileX, tileY, tw, th});
                }
            }
        } // mutex released here

        // ── Phase 2: JPEG-encode only changed tiles (no lock needed) ──
        LARGE_INTEGER freq, counter;
        QueryPerformanceFrequency(&freq);
        QueryPerformanceCounter(&counter);
        double now = (double)counter.QuadPart / (double)freq.QuadPart * 1000.0;

        EnsureGdiPlus();
        CLSID jpegClsid;
        bool hasJpegEncoder = GetEncoderClsid(L"image/jpeg", &jpegClsid);
        if (!hasJpegEncoder) return;

        for (auto &ct : changedTiles) {
            // Create a bitmap for just this tile
            Gdiplus::Bitmap tileBmp(ct.tw, ct.th, PixelFormat32bppRGB);
            Gdiplus::BitmapData bmpData;
            Gdiplus::Rect lockRect(0, 0, ct.tw, ct.th);
            if (tileBmp.LockBits(&lockRect, Gdiplus::ImageLockModeWrite,
                                 PixelFormat32bppRGB, &bmpData) == Gdiplus::Ok) {
                for (int y = 0; y < ct.th; y++) {
                    const BYTE *src = pixels.data() + (ct.tileY + y) * rowBytes + ct.tileX * 4;
                    BYTE *dst = (BYTE *)bmpData.Scan0 + y * bmpData.Stride;
                    memcpy(dst, src, ct.tw * 4);
                }
                tileBmp.UnlockBits(&bmpData);
            }

            // Encode to JPEG
            IStream *pStream = nullptr;
            CreateStreamOnHGlobal(nullptr, TRUE, &pStream);
            if (!pStream) continue;

            ULONG jpegQuality = (ULONG)(quality * 100);
            Gdiplus::EncoderParameters params;
            params.Count = 1;
            params.Parameter[0].Guid = Gdiplus::EncoderQuality;
            params.Parameter[0].Type = Gdiplus::EncoderParameterValueTypeLong;
            params.Parameter[0].NumberOfValues = 1;
            params.Parameter[0].Value = &jpegQuality;

            if (tileBmp.Save(pStream, &jpegClsid, &params) == Gdiplus::Ok) {
                STATSTG stat;
                pStream->Stat(&stat, STATFLAG_NONAME);
                ULONG dataSize = (ULONG)stat.cbSize.QuadPart;
                std::vector<BYTE> jpegData(dataSize);
                LARGE_INTEGER seekZero;
                seekZero.QuadPart = 0;
                pStream->Seek(seekZero, STREAM_SEEK_SET, nullptr);
                ULONG bytesRead = 0;
                pStream->Read(jpegData.data(), dataSize, &bytesRead);

                TileResult tile;
                tile.xIndex = ct.col;
                tile.yIndex = ct.row;
                tile.width = ct.tw;
                tile.height = ct.th;
                tile.image = Base64Encode(jpegData);
                tile.timestamp = now;
                tiles.push_back(tile);
            }
            pStream->Release();
        }
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        Napi::Object result = Napi::Object::New(Env());
        result.Set("x", winX);
        result.Set("y", winY);
        result.Set("width", imgWidth);
        result.Set("height", imgHeight);

        Napi::Array tilesArr = Napi::Array::New(Env(), tiles.size());
        for (size_t i = 0; i < tiles.size(); i++) {
            Napi::Object t = Napi::Object::New(Env());
            t.Set("xIndex", tiles[i].xIndex);
            t.Set("yIndex", tiles[i].yIndex);
            t.Set("width", tiles[i].width);
            t.Set("height", tiles[i].height);
            t.Set("image", tiles[i].image);
            t.Set("timestamp", tiles[i].timestamp);
            tilesArr.Set((uint32_t)i, t);
        }
        result.Set("tiles", tilesArr);
        Callback().Call({Env().Null(), result});
    }

private:
    HWND hwnd;
    int tileSize;
    double quality;
    double sinceTimestamp;
    int imgWidth = 0;
    int imgHeight = 0;
    int winX = 0;
    int winY = 0;

    struct TileResult {
        int xIndex, yIndex, width, height;
        std::string image;
        double timestamp;
    };
    std::vector<TileResult> tiles;
};

static Napi::Value CaptureWindow(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 5) {
        Napi::TypeError::New(env,
            "Expected (windowId, tileSize, quality, sinceTimestamp, callback)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    // windowId is passed as a number (the HWND cast to uintptr_t)
    uintptr_t hwndVal = (uintptr_t)info[0].As<Napi::Number>().Int64Value();
    HWND hwnd = (HWND)hwndVal;
    int tileSize = info[1].As<Napi::Number>().Int32Value();
    double quality = info[2].As<Napi::Number>().DoubleValue();
    double sinceTimestamp = info[3].As<Napi::Number>().DoubleValue();
    Napi::Function cb = info[4].As<Napi::Function>();

    auto *worker = new CaptureWorker(cb, hwnd, tileSize, quality, sinceTimestamp);
    worker->Queue();
    return env.Undefined();
}

// ──────────────────────────────────────────────
// 9. Perform action
// ──────────────────────────────────────────────

// Force a window to the foreground, working around SetForegroundWindow restrictions
static void ForceForegroundWindow(HWND hwnd) {
    HWND hForeground = GetForegroundWindow();
    if (!hForeground) {
        // No foreground window — we can set directly
        BringWindowToTop(hwnd);
        SetForegroundWindow(hwnd);
        return;
    }

    DWORD foreThread = GetWindowThreadProcessId(hForeground, nullptr);
    DWORD appThread = GetCurrentThreadId();

    if (foreThread != appThread) {
        AttachThreadInput(foreThread, appThread, TRUE);
        BringWindowToTop(hwnd);
        SetForegroundWindow(hwnd);
        AttachThreadInput(foreThread, appThread, FALSE);
    } else {
        BringWindowToTop(hwnd);
        SetForegroundWindow(hwnd);
    }
}

static void PostMouseClick(POINT pt, bool isRight) {
    // Use absolute coordinates for reliable click placement
    double fScreenWidth = GetSystemMetrics(SM_CXSCREEN) - 1;
    double fScreenHeight = GetSystemMetrics(SM_CYSCREEN) - 1;
    double fx = pt.x * (65535.0 / fScreenWidth);
    double fy = pt.y * (65535.0 / fScreenHeight);

    INPUT inputs[3] = {};
    // Move to position
    inputs[0].type = INPUT_MOUSE;
    inputs[0].mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
    inputs[0].mi.dx = (LONG)fx;
    inputs[0].mi.dy = (LONG)fy;
    // Button down
    inputs[1].type = INPUT_MOUSE;
    inputs[1].mi.dwFlags = isRight ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
    // Button up
    inputs[2].type = INPUT_MOUSE;
    inputs[2].mi.dwFlags = isRight ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;

    SendInput(3, inputs, sizeof(INPUT));
}

static void PostMouseMove(POINT pt) {
    // Use absolute coordinates via SendInput
    double fScreenWidth = GetSystemMetrics(SM_CXSCREEN) - 1;
    double fScreenHeight = GetSystemMetrics(SM_CYSCREEN) - 1;
    double fx = pt.x * (65535.0 / fScreenWidth);
    double fy = pt.y * (65535.0 / fScreenHeight);

    INPUT input = {};
    input.type = INPUT_MOUSE;
    input.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
    input.mi.dx = (LONG)fx;
    input.mi.dy = (LONG)fy;
    SendInput(1, &input, sizeof(INPUT));
}

static void PostScroll(int deltaX, int deltaY) {
    // The web UI sends pre-scaled values (browser deltaY / 3), typically
    // ~33 for a mouse wheel notch, ~1-10 for trackpad fine scroll.
    // WHEEL_DELTA (120) = one notch. Scale so ~33 ≈ one notch.
    if (deltaY != 0) {
        INPUT input = {};
        input.type = INPUT_MOUSE;
        input.mi.dwFlags = MOUSEEVENTF_WHEEL;
        input.mi.mouseData = (DWORD)(-deltaY * 4);
        SendInput(1, &input, sizeof(INPUT));
    }
    if (deltaX != 0) {
        INPUT input = {};
        input.type = INPUT_MOUSE;
        input.mi.dwFlags = MOUSEEVENTF_HWHEEL;
        input.mi.mouseData = (DWORD)(deltaX * 4);
        SendInput(1, &input, sizeof(INPUT));
    }
}

// Map common key names to Windows virtual key codes
static const std::unordered_map<std::string, WORD> keyMap = {
    {"return", VK_RETURN}, {"enter", VK_RETURN}, {"tab", VK_TAB}, {"space", VK_SPACE},
    {"delete", VK_DELETE}, {"backspace", VK_BACK}, {"escape", VK_ESCAPE}, {"esc", VK_ESCAPE},
    {"shift", VK_SHIFT}, {"capslock", VK_CAPITAL},
    {"alt", VK_MENU}, {"option", VK_MENU},
    {"control", VK_CONTROL}, {"ctrl", VK_CONTROL},
    {"command", VK_LWIN}, {"cmd", VK_LWIN}, {"meta", VK_LWIN},
    {"f1", VK_F1}, {"f2", VK_F2}, {"f3", VK_F3}, {"f4", VK_F4},
    {"f5", VK_F5}, {"f6", VK_F6}, {"f7", VK_F7}, {"f8", VK_F8},
    {"f9", VK_F9}, {"f10", VK_F10}, {"f11", VK_F11}, {"f12", VK_F12},
    {"home", VK_HOME}, {"end", VK_END}, {"pageup", VK_PRIOR}, {"pagedown", VK_NEXT},
    {"left", VK_LEFT}, {"right", VK_RIGHT}, {"down", VK_DOWN}, {"up", VK_UP},
    {"arrowleft", VK_LEFT}, {"arrowright", VK_RIGHT}, {"arrowdown", VK_DOWN}, {"arrowup", VK_UP},
    {"insert", VK_INSERT}, {"printscreen", VK_SNAPSHOT},
};

static void PostKeyInput(const std::string &keyStr) {
    // Parse modifier+key combos like "ctrl+c"
    std::vector<std::string> parts;
    std::string current;
    std::string lower = keyStr;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);

    for (char c : lower) {
        if (c == '+') {
            if (!current.empty()) { parts.push_back(current); current.clear(); }
        } else {
            current += c;
        }
    }
    if (!current.empty()) parts.push_back(current);
    if (parts.empty()) return;

    std::string mainKey = parts.back();

    // Collect modifier VKs
    std::vector<WORD> modVKs;
    for (size_t i = 0; i < parts.size() - 1; i++) {
        const auto &mod = parts[i];
        if (mod == "ctrl" || mod == "control") modVKs.push_back(VK_CONTROL);
        else if (mod == "shift") modVKs.push_back(VK_SHIFT);
        else if (mod == "alt" || mod == "option") modVKs.push_back(VK_MENU);
        else if (mod == "cmd" || mod == "command" || mod == "meta") modVKs.push_back(VK_LWIN);
    }

    // Resolve main key VK
    WORD vk = 0;
    auto it = keyMap.find(mainKey);
    if (it != keyMap.end()) {
        vk = it->second;
    } else if (mainKey.length() == 1) {
        // VkKeyScan for single character
        SHORT vks = VkKeyScanA(mainKey[0]);
        if (vks != -1) {
            vk = LOBYTE(vks);
        }
    }

    if (vk == 0) return;

    // Build INPUT array: modifiers down, key down, key up, modifiers up
    std::vector<INPUT> inputs;

    for (WORD mod : modVKs) {
        INPUT inp = {};
        inp.type = INPUT_KEYBOARD;
        inp.ki.wVk = mod;
        inputs.push_back(inp);
    }

    // Key down
    INPUT keyDown = {};
    keyDown.type = INPUT_KEYBOARD;
    keyDown.ki.wVk = vk;
    inputs.push_back(keyDown);

    // Key up
    INPUT keyUp = {};
    keyUp.type = INPUT_KEYBOARD;
    keyUp.ki.wVk = vk;
    keyUp.ki.dwFlags = KEYEVENTF_KEYUP;
    inputs.push_back(keyUp);

    // Modifiers up (reverse order)
    for (int i = (int)modVKs.size() - 1; i >= 0; i--) {
        INPUT inp = {};
        inp.type = INPUT_KEYBOARD;
        inp.ki.wVk = modVKs[i];
        inp.ki.dwFlags = KEYEVENTF_KEYUP;
        inputs.push_back(inp);
    }

    SendInput((UINT)inputs.size(), inputs.data(), sizeof(INPUT));
}

static void PostTextInput(const std::string &text) {
    std::wstring wtext = Utf8ToWide(text);

    std::vector<INPUT> inputs;
    inputs.reserve(wtext.size() * 2);

    for (wchar_t ch : wtext) {
        INPUT down = {};
        down.type = INPUT_KEYBOARD;
        down.ki.wScan = ch;
        down.ki.dwFlags = KEYEVENTF_UNICODE;
        inputs.push_back(down);

        INPUT up = {};
        up.type = INPUT_KEYBOARD;
        up.ki.wScan = ch;
        up.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        inputs.push_back(up);
    }

    SendInput((UINT)inputs.size(), inputs.data(), sizeof(INPUT));
}

static Napi::Value PerformAction(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected action payload object").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object payload = info[0].As<Napi::Object>();
    std::string action = payload.Get("action").As<Napi::String>().Utf8Value();
    std::string windowIdStr = payload.Get("windowId").As<Napi::String>().Utf8Value();

    uintptr_t hwndVal = 0;
    try {
        hwndVal = (uintptr_t)std::stoull(windowIdStr);
    } catch (const std::exception &) {
        Napi::Error::New(env, "Invalid windowId: " + windowIdStr).ThrowAsJavaScriptException();
        return env.Null();
    }
    HWND hwnd = (HWND)hwndVal;

    if (!IsWindow(hwnd)) {
        Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (action == "focus") {
        // Bring window to foreground
        if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
        ForceForegroundWindow(hwnd);
    }
    else if (action == "minimize") {
        ShowWindow(hwnd, SW_MINIMIZE);
    }
    else if (action == "maximize") {
        ShowWindow(hwnd, SW_MAXIMIZE);
    }
    else if (action == "restore") {
        ShowWindow(hwnd, SW_RESTORE);
    }
    else if (action == "close") {
        PostMessageW(hwnd, WM_CLOSE, 0, 0);
    }
    else if (action == "click" || action == "rightClick") {
        double x = payload.Has("x") ? payload.Get("x").As<Napi::Number>().DoubleValue() : 0;
        double y = payload.Has("y") ? payload.Get("y").As<Napi::Number>().DoubleValue() : 0;

        // x, y are relative to the window — convert to screen coords
        RECT rect;
        GetWindowRect(hwnd, &rect);
        POINT screenPt = {rect.left + (LONG)x, rect.top + (LONG)y};

        // Ensure window is in front for click
        ForceForegroundWindow(hwnd);
        Sleep(50);

        PostMouseClick(screenPt, action == "rightClick");
    }
    else if (action == "hover") {
        double x = payload.Has("x") ? payload.Get("x").As<Napi::Number>().DoubleValue() : 0;
        double y = payload.Has("y") ? payload.Get("y").As<Napi::Number>().DoubleValue() : 0;

        RECT rect;
        GetWindowRect(hwnd, &rect);
        POINT screenPt = {rect.left + (LONG)x, rect.top + (LONG)y};
        PostMouseMove(screenPt);
    }
    else if (action == "textInput") {
        std::string text = payload.Has("text")
            ? payload.Get("text").As<Napi::String>().Utf8Value() : "";
        ForceForegroundWindow(hwnd);
        Sleep(100);
        PostTextInput(text);
    }
    else if (action == "keyInput") {
        std::string key = payload.Has("key")
            ? payload.Get("key").As<Napi::String>().Utf8Value() : "";
        ForceForegroundWindow(hwnd);
        Sleep(100);
        PostKeyInput(key);
    }
    else if (action == "scroll") {
        double x = payload.Has("x") ? payload.Get("x").As<Napi::Number>().DoubleValue() : 0;
        double y = payload.Has("y") ? payload.Get("y").As<Napi::Number>().DoubleValue() : 0;
        int deltaX = payload.Has("scrollDeltaX")
            ? payload.Get("scrollDeltaX").As<Napi::Number>().Int32Value() : 0;
        int deltaY = payload.Has("scrollDeltaY")
            ? payload.Get("scrollDeltaY").As<Napi::Number>().Int32Value() : 0;

        RECT rect;
        GetWindowRect(hwnd, &rect);
        POINT screenPt = {rect.left + (LONG)x, rect.top + (LONG)y};

        ForceForegroundWindow(hwnd);
        Sleep(50);
        SetCursorPos(screenPt.x, screenPt.y);
        Sleep(20);
        PostScroll(deltaX, deltaY);
    }
    else if (action == "resize") {
        double newWidth = payload.Has("newWidth")
            ? payload.Get("newWidth").As<Napi::Number>().DoubleValue() : 0;
        double newHeight = payload.Has("newHeight")
            ? payload.Get("newHeight").As<Napi::Number>().DoubleValue() : 0;

        if (newWidth <= 0 || newHeight <= 0) {
            Napi::Error::New(env, "resize requires positive newWidth and newHeight")
                .ThrowAsJavaScriptException();
            return env.Null();
        }

        RECT rect;
        GetWindowRect(hwnd, &rect);
        SetWindowPos(hwnd, nullptr, rect.left, rect.top,
                     (int)newWidth, (int)newHeight,
                     SWP_NOZORDER | SWP_NOACTIVATE);
    }
    else {
        Napi::Error::New(env, "Unknown action: " + action).ThrowAsJavaScriptException();
        return env.Null();
    }

    return env.Undefined();
}

// ──────────────────────────────────────────────
// 10. Clear window cache
// ──────────────────────────────────────────────

static Napi::Value ClearWindowCache(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        return env.Undefined();
    }
    uintptr_t hwndVal = (uintptr_t)info[0].As<Napi::Number>().Int64Value();
    std::lock_guard<std::mutex> lock(g_cacheMutex);
    g_windowCaches.erase(hwndVal);
    return env.Undefined();
}

// ──────────────────────────────────────────────
// 11. Permissions — no-op on Windows
// ──────────────────────────────────────────────

static Napi::Value HasScreenRecordingPermission(const Napi::CallbackInfo &info) {
    return Napi::Boolean::New(info.Env(), true);
}

static Napi::Value HasAccessibilityPermission(const Napi::CallbackInfo &info) {
    return Napi::Boolean::New(info.Env(), true);
}

static Napi::Value RequestScreenRecordingPermission(const Napi::CallbackInfo &info) {
    return info.Env().Undefined();
}

static Napi::Value RequestAccessibilityPermission(const Napi::CallbackInfo &info) {
    return info.Env().Undefined();
}

// ──────────────────────────────────────────────
// Module init
// ──────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Initialise GDI+ on module load
    EnsureGdiPlus();

    exports.Set("getInstalledApps", Napi::Function::New(env, GetInstalledApps));
    exports.Set("getRunningApps", Napi::Function::New(env, GetRunningApps));
    exports.Set("getAppState", Napi::Function::New(env, GetAppState));
    exports.Set("launchApp", Napi::Function::New(env, LaunchApp));
    exports.Set("quitApp", Napi::Function::New(env, QuitApp));
    exports.Set("getAppIcon", Napi::Function::New(env, GetAppIcon));
    exports.Set("getWindows", Napi::Function::New(env, GetWindows));
    exports.Set("captureWindow", Napi::Function::New(env, CaptureWindow));
    exports.Set("performAction", Napi::Function::New(env, PerformAction));
    exports.Set("clearWindowCache", Napi::Function::New(env, ClearWindowCache));
    exports.Set("hasScreenRecordingPermission", Napi::Function::New(env, HasScreenRecordingPermission));
    exports.Set("hasAccessibilityPermission", Napi::Function::New(env, HasAccessibilityPermission));
    exports.Set("requestScreenRecordingPermission", Napi::Function::New(env, RequestScreenRecordingPermission));
    exports.Set("requestAccessibilityPermission", Napi::Function::New(env, RequestAccessibilityPermission));
    return exports;
}

NODE_API_MODULE(AppsWin, Init)
