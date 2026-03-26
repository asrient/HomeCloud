/**
 * AppsWin.cpp
 *
 * Node N-API native addon for Windows remote-desktop functionality.
 *
 * Provides:
 *   - getInstalledApps()        → list installed apps from registry + shell
 *   - getRunningApps()          → list running GUI apps (EnumWindows)
 *   - launchApp(appId)          → open app via ShellExecuteEx
 *   - quitApp(appId)            → close app via WM_CLOSE
 *   - getAppIcon(appId)         → extract icon as base64 PNG data URI
 *   - getWindows(appId?)        → visible windows (EnumWindows)
 *   - captureWindow(hwnd, tileSize, quality, cb)
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
#include <commoncontrols.h>

#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <mutex>
#include <algorithm>
#include <cstring>
#include <cmath>
#include <ppl.h>

// Windows Graphics Capture (Windows 10 1803+)
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <d3d11.h>
#include <d3d11_4.h>
#include <dxgi.h>
#include <wincrypt.h>

// Media Foundation H.264 encoding
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <mftransform.h>
#include <mferror.h>
#include <codecapi.h>
#include <icodecapi.h>
#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "windowsapp.lib")
#pragma comment(lib, "mf.lib")
#pragma comment(lib, "mfplat.lib")
#pragma comment(lib, "mfuuid.lib")
#pragma comment(lib, "mfreadwrite.lib")
#pragma comment(lib, "crypt32.lib")

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

// Check if a window is a valid owned popup (visible, not cloaked, has owner, ≥2px)
static bool IsValidPopupWindow(HWND hwnd, HWND *outOwner = nullptr) {
    if (!IsWindowVisible(hwnd)) return false;
    HWND owner = GetWindow(hwnd, GW_OWNER);
    if (!owner) return false;
    BOOL cloaked = FALSE;
    DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &cloaked, sizeof(cloaked));
    if (cloaked) return false;
    RECT rect;
    if (!GetWindowRect(hwnd, &rect)) return false;
    if (rect.right - rect.left < 2 || rect.bottom - rect.top < 2) return false;
    if (outOwner) *outOwner = owner;
    return true;
}

// Detect window type string for normal app windows (first pass)
static std::string DetectWindowType(HWND hwnd) {
    LONG_PTR exStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);

    // Check if this is a modal dialog
    if (exStyle & WS_EX_DLGMODALFRAME) return "modal";

    // Check class name for dialog
    WCHAR className[256] = {0};
    GetClassNameW(hwnd, className, 256);
    if (_wcsicmp(className, L"#32770") == 0) return "modal"; // system dialog class

    return "regular";
}

// Detect window type string for owned/popup windows (second pass)
static std::string DetectPopupWindowType(HWND hwnd) {
    WCHAR className[256] = {0};
    GetClassNameW(hwnd, className, 256);

    if (_wcsicmp(className, L"tooltips_class32") == 0) return "tooltip";
    if (_wcsicmp(className, L"#32768") == 0) return "contextMenu"; // system menu class

    LONG_PTR exStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);

    // Tool windows that are topmost → floating
    if ((exStyle & WS_EX_TOOLWINDOW) && (exStyle & WS_EX_TOPMOST)) return "floating";
    if (exStyle & WS_EX_TOOLWINDOW) return "floating";

    // Modal-frame popups
    if (exStyle & WS_EX_DLGMODALFRAME) return "modal";
    if (_wcsicmp(className, L"#32770") == 0) return "modal";

    return "popup";
}

// ──────────────────────────────────────────────
// Plain data structs for window/app info
// ──────────────────────────────────────────────

struct WindowInfoData {
    std::string id;
    std::string appId;
    std::string title;
    std::string type;
    bool isFocused = false;
    bool isHidden = false;
    bool isMinimized = false;
    bool isMaximized = false;
    double x = 0, y = 0, width = 0, height = 0;
    std::string parentWindowId;
};

struct AppInfoData {
    std::string name;
    std::string id;
    std::string iconPath;
};

static WindowInfoData collectWindowInfo(HWND hwnd, HWND foregroundHwnd, HWND ownerHwnd = nullptr) {
    WindowInfoData info;
    info.id = std::to_string((uintptr_t)hwnd);

    WCHAR title[512] = {0};
    GetWindowTextW(hwnd, title, 512);
    info.title = WideToUtf8(title);

    DWORD pid = GetWindowPID(hwnd);
    std::wstring exePath = GetProcessExePath(pid);
    info.appId = WideToUtf8(exePath);

    info.type = ownerHwnd ? DetectPopupWindowType(hwnd) : DetectWindowType(hwnd);
    info.isFocused = (hwnd == foregroundHwnd);
    info.isHidden = ownerHwnd ? false : !IsWindowVisible(hwnd);
    info.isMinimized = ownerHwnd ? false : (bool)IsIconic(hwnd);
    info.isMaximized = ownerHwnd ? false : (bool)IsZoomed(hwnd);

    RECT rect;
    if (GetWindowRect(hwnd, &rect)) {
        info.x = (double)rect.left;
        info.y = (double)rect.top;
        info.width = (double)(rect.right - rect.left);
        info.height = (double)(rect.bottom - rect.top);
    }

    if (ownerHwnd) {
        info.parentWindowId = std::to_string((uintptr_t)ownerHwnd);
    }
    return info;
}

static Napi::Object windowInfoToNapi(Napi::Env env, const WindowInfoData &info) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("id", info.id);
    obj.Set("appId", info.appId);
    obj.Set("title", info.title);
    obj.Set("type", info.type);
    obj.Set("isFocused", info.isFocused);
    obj.Set("isHidden", info.isHidden);
    obj.Set("isMinimized", info.isMinimized);
    obj.Set("isMaximized", info.isMaximized);
    obj.Set("x", info.x);
    obj.Set("y", info.y);
    obj.Set("width", info.width);
    obj.Set("height", info.height);
    if (!info.parentWindowId.empty()) {
        obj.Set("parentWindowId", info.parentWindowId);
    }
    return obj;
}

static AppInfoData collectAppInfo(const std::wstring &exePath) {
    AppInfoData info;
    info.id = WideToUtf8(exePath);
    info.iconPath = info.id;
    auto slash = exePath.find_last_of(L'\\');
    std::wstring name = (slash != std::wstring::npos) ? exePath.substr(slash + 1) : exePath;
    auto dot = name.find_last_of(L'.');
    if (dot != std::wstring::npos) name = name.substr(0, dot);
    info.name = WideToUtf8(name);
    return info;
}

static Napi::Object appInfoToNapi(Napi::Env env, const AppInfoData &info) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("name", info.name);
    obj.Set("id", info.id);
    obj.Set("iconPath", info.iconPath);
    return obj;
}

// Build a Napi window-info object from an HWND.
static Napi::Object MakeWindowInfo(Napi::Env env, HWND hwnd, HWND foregroundHwnd,
                                    HWND ownerHwnd = nullptr) {
    return windowInfoToNapi(env, collectWindowInfo(hwnd, foregroundHwnd, ownerHwnd));
}

// ──────────────────────────────────────────────
// H.264 streaming via WGC + Media Foundation
// ──────────────────────────────────────────────

// Check if WGC is available at runtime (Win10 1803+)
static bool IsWGCAvailable() {
    static int cached = -1;
    if (cached >= 0) return cached != 0;
    try {
        cached = winrt::Windows::Graphics::Capture::GraphicsCaptureSession::IsSupported() ? 1 : 0;
    } catch (...) {
        cached = 0;
    }
    return cached != 0;
}

// Forward declarations for H.264 stream management
struct H264WinStreamContext;
static void stopH264WinStream(HWND hwnd);

struct H264WinStreamContext {
    HWND hwnd = NULL;
    int width = 0;
    int height = 0;
    int dpi = 1;
    int targetFps = 30;
    int targetBitrate = 15000000;
    bool stopped = false;
    bool isFirstFrame = true;
    bool pipelineFailed = false;
    std::mutex mutex;

    // WGC
    winrt::Windows::Graphics::Capture::GraphicsCaptureItem item{nullptr};
    winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool framePool{nullptr};
    winrt::Windows::Graphics::Capture::GraphicsCaptureSession session{nullptr};
    winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool::FrameArrived_revoker frameArrivedRevoker;

    // D3D11
    winrt::com_ptr<ID3D11Device> d3dDevice;
    winrt::com_ptr<ID3D11DeviceContext> d3dContext;

    // MF pipeline: D3D11 Video Processor (BGRA→NV12 on GPU) → H.264 encoder
    winrt::com_ptr<ID3D11VideoDevice> videoDevice;
    winrt::com_ptr<ID3D11VideoContext> videoCtx;
    winrt::com_ptr<ID3D11VideoProcessorEnumerator> vpEnum;
    winrt::com_ptr<ID3D11VideoProcessor> d3dVP;
    winrt::com_ptr<ID3D11Texture2D> nv12Texture; // output texture for VP
    winrt::com_ptr<IMFTransform> encoder;
    winrt::com_ptr<IMFDXGIDeviceManager> dxgiManager;
    winrt::com_ptr<IMFMediaEventGenerator> encEventGen;
    UINT dxgiResetToken = 0;
    DWORD encInputStreamId = 0;
    DWORD encOutputStreamId = 0;
    bool isEncoderAsync = false;
    int encWidth = 0;  // rounded-up dimensions used by encoder
    int encHeight = 0;

    // Async encoder thread: WGC callback pushes NV12 samples here,
    // encoder thread consumes them using blocking GetEvent
    std::mutex encQueueMutex;
    std::condition_variable encQueueCv;
    std::vector<winrt::com_ptr<IMFSample>> encQueue;
    std::thread encThread;
    LONGLONG lastTimestamp = 0;

    // N-API callback
    Napi::ThreadSafeFunction tsfn;

    bool initPipeline(int rawW, int rawH) {
        // Encoder dimensions: H.264 requires even dimensions — round up
        int ew = (rawW + 1) & ~1;
        int eh = (rawH + 1) & ~1;

        // H.264 requires minimum 64x64
        if (ew < 64 || eh < 64) {
            printf("[H264Win] initPipeline: dimensions %dx%d too small for H.264\n", ew, eh);
            pipelineFailed = true;
            return false;
        }

        // Shut down previous encoder thread before releasing resources it uses.
        // The thread accesses encoder/encEventGen via GetEvent(0) — we must join
        // it before nullifying those COM pointers to avoid use-after-free.
        if (encThread.joinable()) {
            if (encoder) {
                encoder->ProcessMessage(MFT_MESSAGE_COMMAND_FLUSH, 0);
            }
            {
                std::lock_guard<std::mutex> qlock(encQueueMutex);
                encQueue.clear();
                encQueue.push_back(nullptr); // sentinel to exit thread
            }
            encQueueCv.notify_all();
            encThread.join();
        }

        videoDevice = nullptr;
        videoCtx = nullptr;
        vpEnum = nullptr;
        d3dVP = nullptr;
        nv12Texture = nullptr;
        encoder = nullptr;
        encEventGen = nullptr;
        isEncoderAsync = false;
        encWidth = ew;
        encHeight = eh;

        // Create DXGI Device Manager to share D3D11 device between MFTs
        HRESULT hr = MFCreateDXGIDeviceManager(&dxgiResetToken, dxgiManager.put());
        if (FAILED(hr)) { printf("[H264Win] initPipeline: MFCreateDXGIDeviceManager failed 0x%08lX\n", hr); return false; }
        hr = dxgiManager->ResetDevice(d3dDevice.get(), dxgiResetToken);
        if (FAILED(hr)) { printf("[H264Win] initPipeline: ResetDevice failed 0x%08lX\n", hr); return false; }

        // ── D3D11 Video Processor (BGRA → NV12, GPU — like Chromium) ──
        hr = d3dDevice->QueryInterface(IID_PPV_ARGS(videoDevice.put()));
        if (FAILED(hr)) { printf("[H264Win] initPipeline: QueryInterface ID3D11VideoDevice failed 0x%08lX\n", hr); return false; }
        hr = d3dContext->QueryInterface(IID_PPV_ARGS(videoCtx.put()));
        if (FAILED(hr)) { printf("[H264Win] initPipeline: QueryInterface ID3D11VideoContext failed 0x%08lX\n", hr); return false; }

        D3D11_VIDEO_PROCESSOR_CONTENT_DESC vpDesc = {};
        vpDesc.InputFrameFormat = D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE;
        vpDesc.InputFrameRate.Numerator = targetFps;
        vpDesc.InputFrameRate.Denominator = 1;
        vpDesc.InputWidth = rawW;
        vpDesc.InputHeight = rawH;
        vpDesc.OutputFrameRate.Numerator = targetFps;
        vpDesc.OutputFrameRate.Denominator = 1;
        vpDesc.OutputWidth = ew;
        vpDesc.OutputHeight = eh;
        vpDesc.Usage = D3D11_VIDEO_USAGE_PLAYBACK_NORMAL;

        hr = videoDevice->CreateVideoProcessorEnumerator(&vpDesc, vpEnum.put());
        if (FAILED(hr)) { printf("[H264Win] initPipeline: CreateVideoProcessorEnumerator failed 0x%08lX\n", hr); return false; }
        hr = videoDevice->CreateVideoProcessor(vpEnum.get(), 0, d3dVP.put());
        if (FAILED(hr)) { printf("[H264Win] initPipeline: CreateVideoProcessor failed 0x%08lX\n", hr); return false; }

        // Disable auto processing (per Chromium — saves power)
        videoCtx->VideoProcessorSetStreamAutoProcessingMode(d3dVP.get(), 0, FALSE);

        // Create NV12 output texture at even encoder dimensions
        D3D11_TEXTURE2D_DESC nv12Desc = {};
        nv12Desc.Width = ew;
        nv12Desc.Height = eh;
        nv12Desc.MipLevels = 1;
        nv12Desc.ArraySize = 1;
        nv12Desc.Format = DXGI_FORMAT_NV12;
        nv12Desc.SampleDesc.Count = 1;
        nv12Desc.Usage = D3D11_USAGE_DEFAULT;
        nv12Desc.BindFlags = D3D11_BIND_RENDER_TARGET;
        hr = d3dDevice->CreateTexture2D(&nv12Desc, nullptr, nv12Texture.put());
        if (FAILED(hr)) { printf("[H264Win] initPipeline: CreateTexture2D NV12 failed 0x%08lX\n", hr); return false; }

        // ── H.264 Encoder MFT ──
        MFT_REGISTER_TYPE_INFO encOutInfo = { MFMediaType_Video, MFVideoFormat_H264 };
        IMFActivate **ppActivate = nullptr;
        UINT32 count = 0;

        // Hardware H.264 encoder (GPU-accelerated — available on all modern GPUs)
        hr = MFTEnumEx(MFT_CATEGORY_VIDEO_ENCODER,
            MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER,
            nullptr, &encOutInfo, &ppActivate, &count);
        if (FAILED(hr) || count == 0) {
            // Fallback: any available encoder (async or sync)
            hr = MFTEnumEx(MFT_CATEGORY_VIDEO_ENCODER,
                MFT_ENUM_FLAG_ASYNCMFT | MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER,
                nullptr, &encOutInfo, &ppActivate, &count);
        }
        if (FAILED(hr) || count == 0) { printf("[H264Win] initPipeline: MFTEnumEx failed hr=0x%08lX count=%u\n", hr, count); return false; }

        hr = ppActivate[0]->ActivateObject(IID_PPV_ARGS(encoder.put()));
        for (UINT32 i = 0; i < count; i++) ppActivate[i]->Release();
        CoTaskMemFree(ppActivate);
        if (FAILED(hr)) { printf("[H264Win] initPipeline: ActivateObject failed 0x%08lX\n", hr); return false; }

        // Unlock async MFT if needed (per MS Learn: async MFTs return
        // MF_E_TRANSFORM_ASYNC_LOCKED on most methods until unlocked)
        {
            winrt::com_ptr<IMFAttributes> attrs;
            if (SUCCEEDED(encoder->GetAttributes(attrs.put())) && attrs) {
                UINT32 isAsync = 0;
                if (SUCCEEDED(attrs->GetUINT32(MF_TRANSFORM_ASYNC, &isAsync)) && isAsync) {
                    hr = attrs->SetUINT32(MF_TRANSFORM_ASYNC_UNLOCK, TRUE);
                    if (FAILED(hr)) { printf("[H264Win] initPipeline: async unlock failed 0x%08lX\n", hr); encoder = nullptr; return false; }
                    isEncoderAsync = true;
                    encoder->QueryInterface(IID_PPV_ARGS(encEventGen.put()));
                    printf("[H264Win] initPipeline: unlocked async encoder\n");
                }
            }
        }

        // Enable D3D11 on encoder
        encoder->ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER,
            (ULONG_PTR)dxgiManager.get());

        // Low latency, no B-frames — must be set before SetOutputType per docs
        auto codecApi = encoder.try_as<ICodecAPI>();
        if (codecApi) {
            VARIANT v;
            VariantInit(&v);
            v.vt = VT_BOOL; v.boolVal = VARIANT_TRUE;
            codecApi->SetValue(&CODECAPI_AVLowLatencyMode, &v);
            v.vt = VT_UI4; v.ulVal = 0;
            codecApi->SetValue(&CODECAPI_AVEncMPVDefaultBPictureCount, &v);
            v.vt = VT_UI4; v.ulVal = (ULONG)(targetFps * 10);
            codecApi->SetValue(&CODECAPI_AVEncMPVGOPSize, &v);
        }

        // Encoder output type — must be set before input type per H.264 encoder docs
        winrt::com_ptr<IMFMediaType> encOutType;
        MFCreateMediaType(encOutType.put());
        encOutType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
        encOutType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_H264);
        encOutType->SetUINT32(MF_MT_AVG_BITRATE, targetBitrate);
        MFSetAttributeRatio(encOutType.get(), MF_MT_FRAME_RATE, targetFps, 1);
        MFSetAttributeSize(encOutType.get(), MF_MT_FRAME_SIZE, ew, eh);
        encOutType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
        encOutType->SetUINT32(MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_Main);
        hr = encoder->SetOutputType(0, encOutType.get(), 0);
        if (FAILED(hr)) { printf("[H264Win] initPipeline: encoder SetOutputType failed 0x%08lX\n", hr); encoder = nullptr; return false; }

        // Encoder input type — negotiate from encoder's preferred types after output is set
        hr = E_FAIL;
        for (DWORD tidx = 0; ; tidx++) {
            winrt::com_ptr<IMFMediaType> avail;
            HRESULT hr2 = encoder->GetInputAvailableType(0, tidx, avail.put());
            if (hr2 == MF_E_NO_MORE_TYPES || FAILED(hr2)) break;
            GUID subtype = {};
            avail->GetGUID(MF_MT_SUBTYPE, &subtype);
            if (subtype == MFVideoFormat_NV12) {
                // Use this preferred type and override frame size/rate
                MFSetAttributeSize(avail.get(), MF_MT_FRAME_SIZE, ew, eh);
                MFSetAttributeRatio(avail.get(), MF_MT_FRAME_RATE, targetFps, 1);
                hr = encoder->SetInputType(0, avail.get(), 0);
                if (SUCCEEDED(hr)) break;
                printf("[H264Win] initPipeline: encoder SetInputType (negotiated NV12) failed 0x%08lX\n", hr);
            }
        }
        // Fallback: construct the input type manually if negotiation didn't work
        if (FAILED(hr)) {
            winrt::com_ptr<IMFMediaType> encInType;
            MFCreateMediaType(encInType.put());
            encInType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
            encInType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_NV12);
            MFSetAttributeRatio(encInType.get(), MF_MT_FRAME_RATE, targetFps, 1);
            MFSetAttributeSize(encInType.get(), MF_MT_FRAME_SIZE, ew, eh);
            encInType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
            hr = encoder->SetInputType(0, encInType.get(), 0);
            if (FAILED(hr)) { printf("[H264Win] initPipeline: encoder SetInputType failed 0x%08lX\n", hr); encoder = nullptr; return false; }
        }

        hr = encoder->GetStreamIDs(1, &encInputStreamId, 1, &encOutputStreamId);
        if (hr == E_NOTIMPL) { encInputStreamId = 0; encOutputStreamId = 0; }

        encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0);
        if (isEncoderAsync) {
            encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0);
            // Start dedicated encoder thread for async event processing
            encThread = std::thread([this]() { encoderThreadFunc(); });
        }

        pipelineFailed = false;
        printf("[H264Win] initPipeline: success %dx%d (enc %dx%d, async=%d)\n", rawW, rawH, ew, eh, isEncoderAsync);
        return true;
    }

    // Encoder thread function for async encoder — blocks on GetEvent(0)
    void encoderThreadFunc() {
        printf("[H264Win] encoder thread started\n");
        while (true) {
            // Wait for a sample in the queue
            winrt::com_ptr<IMFSample> sample;
            {
                std::unique_lock<std::mutex> lock(encQueueMutex);
                encQueueCv.wait(lock, [this] { return stopped || !encQueue.empty(); });
                if (stopped && encQueue.empty()) break;
                sample = encQueue.front();
                encQueue.erase(encQueue.begin());
            }
            if (!sample || stopped) break;

            // Wait for METransformNeedInput
            bool canInput = false;
            for (int i = 0; i < 16; i++) {
                if (stopped) break;
                winrt::com_ptr<IMFMediaEvent> event;
                HRESULT ehr = encEventGen->GetEvent(0, event.put());
                if (FAILED(ehr)) { printf("[H264Win] encThread: GetEvent(NeedInput) failed 0x%08lX\n", ehr); break; }
                MediaEventType met = MEUnknown;
                event->GetType(&met);
                if (met == METransformNeedInput) {
                    canInput = true;
                    break;
                } else if (met == METransformHaveOutput) {
                    drainEncoderOutput(lastTimestamp);
                }
            }
            if (!canInput || stopped) { sample = nullptr; continue; }

            HRESULT hr = encoder->ProcessInput(encInputStreamId, sample.get(), 0);
            sample = nullptr; // Release NV12 sample immediately after feeding
            if (FAILED(hr)) { printf("[H264Win] encThread: ProcessInput failed 0x%08lX\n", hr); continue; }

            // Wait for METransformHaveOutput
            for (int i = 0; i < 16; i++) {
                if (stopped) break;
                winrt::com_ptr<IMFMediaEvent> event;
                HRESULT ehr = encEventGen->GetEvent(0, event.put());
                if (FAILED(ehr)) break;
                MediaEventType met = MEUnknown;
                event->GetType(&met);
                if (met == METransformHaveOutput) {
                    drainEncoderOutput(lastTimestamp);
                    break;
                }
                // METransformNeedInput: encoder wants more input before producing output
                // This is normal for encoders with pipeline delay — break and feed next frame
                if (met == METransformNeedInput) {
                    break;
                }
            }
        }
        printf("[H264Win] encoder thread exiting\n");
    }

    // Helper: try to collect one encoded output from the encoder and emit it.
    // Returns true if output was collected, false otherwise.
    bool drainEncoderOutput(LONGLONG timestamp) {
        if (!encoder) return false;

        MFT_OUTPUT_DATA_BUFFER encOutput = {};
        encOutput.dwStreamID = encOutputStreamId;

        MFT_OUTPUT_STREAM_INFO encStreamInfo = {};
        encoder->GetOutputStreamInfo(encOutputStreamId, &encStreamInfo);
        bool encoderAllocates = (encStreamInfo.dwFlags &
            (MFT_OUTPUT_STREAM_PROVIDES_SAMPLES | MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES)) != 0;

        winrt::com_ptr<IMFSample> outSample;
        if (!encoderAllocates) {
            MFCreateSample(outSample.put());
            winrt::com_ptr<IMFMediaBuffer> outBuf;
            DWORD outBufSize = encStreamInfo.cbSize > 0 ? encStreamInfo.cbSize : (DWORD)(encWidth * encHeight);
            MFCreateMemoryBuffer(outBufSize, outBuf.put());
            outSample->AddBuffer(outBuf.get());
            encOutput.pSample = outSample.get();
        }

        DWORD encStatus = 0;
        HRESULT hr = encoder->ProcessOutput(0, 1, &encOutput, &encStatus);
        if (encOutput.pEvents) encOutput.pEvents->Release();

        if (FAILED(hr)) return false;

        IMFSample *pOutSample = encOutput.pSample;
        if (!pOutSample) return false;

        winrt::com_ptr<IMFMediaBuffer> encBuf;
        pOutSample->ConvertToContiguousBuffer(encBuf.put());
        BYTE *encData = nullptr;
        DWORD encLen = 0;
        encBuf->Lock(&encData, nullptr, &encLen);

        if (encData && encLen > 0) {
            UINT32 picType = 0;
            bool kf = false;
            if (SUCCEEDED(pOutSample->GetUINT32(
                MFSampleExtension_VideoEncodePictureType, &picType))) {
                kf = (picType == eAVEncH264PictureType_IDR);
            }
            if (isFirstFrame) { kf = true; isFirstFrame = false; }

            int cw = width, ch = height, cdpi = dpi;
            bool first = isFirstFrame;
            double ts = (double)timestamp / 10000.0;

            auto nalCopy = std::make_shared<std::vector<uint8_t>>(encData, encData + encLen);
            tsfn.NonBlockingCall([nalCopy, cw, ch, cdpi, kf, first, ts](Napi::Env env, Napi::Function cb) {
                Napi::Object info = Napi::Object::New(env);
                info.Set("data", Napi::Buffer<uint8_t>::Copy(env, nalCopy->data(), nalCopy->size()));
                info.Set("isKeyframe", kf);
                info.Set("width", cw);
                info.Set("height", ch);
                info.Set("dpi", cdpi);
                info.Set("isFirst", first);
                info.Set("timestamp", ts);
                cb.Call({env.Null(), info});
            });
        }
        encBuf->Unlock();
        if (encoderAllocates && encOutput.pSample) {
            encOutput.pSample->Release();
        }
        return encLen > 0;
    }

    void onFrameArrived(
        winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool const& sender,
        winrt::Windows::Foundation::IInspectable const&)
    {
        auto frame = sender.TryGetNextFrame();
        if (!frame) return;

        std::lock_guard<std::mutex> lock(mutex);
        if (stopped) return;

        static int wgcCount = 0;
        static int vpOk = 0, vpFail = 0, queuedCount = 0, droppedCount = 0;
        wgcCount++;
        if (wgcCount <= 3 || wgcCount % 60 == 0) {
            printf("[H264Win] onFrame #%d: vpOk=%d vpFail=%d queued=%d dropped=%d queueSz=%d\n",
                wgcCount, vpOk, vpFail, queuedCount, droppedCount, (int)encQueue.size());
        }

        auto surface = frame.Surface();
        if (!surface) return;

        auto access = surface.as<Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
        winrt::com_ptr<ID3D11Texture2D> frameTex;
        access->GetInterface(IID_PPV_ARGS(frameTex.put()));
        if (!frameTex) return;

        D3D11_TEXTURE2D_DESC desc;
        frameTex->GetDesc(&desc);
        int w = (int)desc.Width;
        int h = (int)desc.Height;

        // Copy the captured texture so we can release the WGC frame immediately.
        D3D11_TEXTURE2D_DESC copyDesc = desc;
        copyDesc.MiscFlags = 0; // Remove SHARED flags that prevent our device from using it
        winrt::com_ptr<ID3D11Texture2D> texCopy;
        HRESULT hrc = d3dDevice->CreateTexture2D(&copyDesc, nullptr, texCopy.put());
        if (FAILED(hrc) || !texCopy) return;
        d3dContext->CopyResource(texCopy.get(), frameTex.get());

        // Release the WGC frame to unblock the frame pool
        frameTex = nullptr;

        // Check ContentSize for frame pool recreation (per OBS approach)
        auto contentSize = frame.ContentSize();
        frame.Close();
        frame = nullptr;

        // Recreate frame pool if content size changed (like OBS does)
        if (contentSize.Width != width || contentSize.Height != height) {
            if (contentSize.Width > 0 && contentSize.Height > 0 && framePool && d3dDevice) {
                auto dxgiDevice = d3dDevice.as<IDXGIDevice>();
                winrt::com_ptr<IInspectable> insp;
                if (SUCCEEDED(CreateDirect3D11DeviceFromDXGIDevice(dxgiDevice.get(), insp.put()))) {
                    auto d3dDev = insp.as<winrt::Windows::Graphics::DirectX::Direct3D11::IDirect3DDevice>();
                    framePool.Recreate(d3dDev,
                        winrt::Windows::Graphics::DirectX::DirectXPixelFormat::B8G8R8A8UIntNormalized,
                        2, contentSize);
                }
            }
        }

        // Create/recreate pipeline if dimensions changed
        if (w != width || h != height || !encoder) {
            if (pipelineFailed && w == width && h == height) return;
            printf("[H264Win] initPipeline: %dx%d (was %dx%d)\n", w, h, width, height);
            width = w;
            height = h;
            isFirstFrame = true;
            pipelineFailed = false;
            if (!initPipeline(w, h)) { printf("[H264Win] initPipeline FAILED\n"); pipelineFailed = true; return; }
        }

        LONGLONG now = MFGetSystemTime();
        lastTimestamp = now;

        // ── Step 1: D3D11 Video Processor (BGRA → NV12) ──
        // Create input view from the captured BGRA texture
        D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC inputViewDesc = {};
        inputViewDesc.ViewDimension = D3D11_VPIV_DIMENSION_TEXTURE2D;
        inputViewDesc.Texture2D.MipSlice = 0;
        winrt::com_ptr<ID3D11VideoProcessorInputView> inputView;
        HRESULT hr = videoDevice->CreateVideoProcessorInputView(
            texCopy.get(), vpEnum.get(), &inputViewDesc, inputView.put());
        if (FAILED(hr)) { vpFail++; if (vpFail <= 3) printf("[H264Win] CreateInputView failed: 0x%08lX\n", hr); return; }

        // Create output view on the NV12 texture
        D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC outputViewDesc = {};
        outputViewDesc.ViewDimension = D3D11_VPOV_DIMENSION_TEXTURE2D;
        winrt::com_ptr<ID3D11VideoProcessorOutputView> outputView;
        hr = videoDevice->CreateVideoProcessorOutputView(
            nv12Texture.get(), vpEnum.get(), &outputViewDesc, outputView.put());
        if (FAILED(hr)) { vpFail++; if (vpFail <= 3) printf("[H264Win] CreateOutputView failed: 0x%08lX\n", hr); return; }

        // Blit: BGRA → NV12
        D3D11_VIDEO_PROCESSOR_STREAM stream = {};
        stream.Enable = TRUE;
        stream.pInputSurface = inputView.get();
        hr = videoCtx->VideoProcessorBlt(d3dVP.get(), outputView.get(), 0, 1, &stream);
        if (FAILED(hr)) { vpFail++; if (vpFail <= 3) printf("[H264Win] VideoProcessorBlt failed: 0x%08lX\n", hr); return; }
        vpOk++;

        // ── Step 2: Feed encoder ──
        // Wrap the NV12 output texture in an IMFSample
        winrt::com_ptr<IMFMediaBuffer> nv12Buf;
        MFCreateDXGISurfaceBuffer(__uuidof(ID3D11Texture2D), nv12Texture.get(), 0, FALSE, nv12Buf.put());
        if (!nv12Buf) return;

        winrt::com_ptr<IMFSample> nv12Sample;
        MFCreateSample(nv12Sample.put());
        nv12Sample->AddBuffer(nv12Buf.get());
        nv12Sample->SetSampleTime(now);
        nv12Sample->SetSampleDuration(10000000LL / targetFps);

        if (isEncoderAsync) {
            // Async encoder: queue sample for dedicated encoder thread
            {
                std::lock_guard<std::mutex> qlock(encQueueMutex);
                while (encQueue.size() >= 2) { encQueue.erase(encQueue.begin()); droppedCount++; }
                encQueue.push_back(nv12Sample);
                queuedCount++;
            }
            encQueueCv.notify_one();
        } else {
            // Sync encoder (unlikely with HW-first but handle gracefully)
            hr = encoder->ProcessInput(encInputStreamId, nv12Sample.get(), 0);
            if (SUCCEEDED(hr)) drainEncoderOutput(now);
        }
    }
};

static std::mutex g_h264WinMutex;
static std::shared_ptr<H264WinStreamContext> g_h264WinStream;
static int g_mfRefCount = 0;  // reference count for MFStartup/MFShutdown

static void stopH264WinStream() {
    std::shared_ptr<H264WinStreamContext> ctx;
    {
        std::lock_guard<std::mutex> lock(g_h264WinMutex);
        ctx = g_h264WinStream;
        g_h264WinStream = nullptr;
    }
    if (!ctx) return;
    printf("[H264Win] stopH264WinStream\n");
    {
        std::lock_guard<std::mutex> lock(ctx->mutex);
        ctx->stopped = true;
    }
    // Wake encoder thread so it can exit
    ctx->encQueueCv.notify_all();
    // Revoke WGC callback first so no new frames arrive
    ctx->frameArrivedRevoker.revoke();
    // Shut down the encoder — this unblocks any pending GetEvent(0) in the encoder thread
    if (ctx->encoder) {
        ctx->encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, 0);
        ctx->encoder->ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN, 0);
    }
    // Now safe to join — GetEvent will return MF_E_SHUTDOWN
    if (ctx->encThread.joinable()) {
        ctx->encThread.join();
    }
    ctx->encEventGen = nullptr;
    ctx->encoder = nullptr;
    ctx->d3dVP = nullptr;
    ctx->vpEnum = nullptr;
    ctx->videoCtx = nullptr;
    ctx->videoDevice = nullptr;
    ctx->nv12Texture = nullptr;
    if (ctx->session) ctx->session.Close();
    if (ctx->framePool) ctx->framePool.Close();
    ctx->item = nullptr;
    ctx->tsfn.Release();
    {
        std::lock_guard<std::mutex> lock(g_h264WinMutex);
        g_mfRefCount--;
        if (g_mfRefCount <= 0) {
            MFShutdown();
            g_mfRefCount = 0;
        }
    }
}

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
// 1. Installed apps (from Start Menu shortcuts)
// ──────────────────────────────────────────────

// Resolve a .lnk shortcut to its target exe path and display name
struct ShortcutInfo {
    std::wstring targetPath;
    std::wstring name;
};

static bool ResolveShortcut(const std::wstring &lnkPath, ShortcutInfo &out) {
    IShellLinkW *psl = nullptr;
    HRESULT hr = CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER,
                                  IID_IShellLinkW, (void **)&psl);
    if (FAILED(hr)) return false;

    IPersistFile *ppf = nullptr;
    hr = psl->QueryInterface(IID_IPersistFile, (void **)&ppf);
    if (FAILED(hr)) { psl->Release(); return false; }

    hr = ppf->Load(lnkPath.c_str(), STGM_READ);
    if (FAILED(hr)) { ppf->Release(); psl->Release(); return false; }

    WCHAR targetBuf[MAX_PATH] = {0};
    WIN32_FIND_DATAW fd = {};
    hr = psl->GetPath(targetBuf, MAX_PATH, &fd, SLGP_RAWPATH);
    if (SUCCEEDED(hr) && wcslen(targetBuf) > 0) {
        out.targetPath = targetBuf;
    }

    // Display name from the .lnk filename (strip extension)
    auto slash = lnkPath.find_last_of(L'\\');
    std::wstring filename = (slash != std::wstring::npos) ? lnkPath.substr(slash + 1) : lnkPath;
    auto dot = filename.find_last_of(L'.');
    if (dot != std::wstring::npos) filename = filename.substr(0, dot);
    out.name = filename;

    ppf->Release();
    psl->Release();
    return !out.targetPath.empty();
}

// Recursively scan a Start Menu folder for .lnk shortcuts pointing to .exe files
static void ScanStartMenuFolder(const std::wstring &dir,
                                std::vector<Napi::Object> &results,
                                std::unordered_set<std::string> &seen,
                                Napi::Env env) {
    WIN32_FIND_DATAW fd;
    std::wstring pattern = dir + L"\\*";
    HANDLE hFind = FindFirstFileW(pattern.c_str(), &fd);
    if (hFind == INVALID_HANDLE_VALUE) return;

    do {
        std::wstring name(fd.cFileName);
        if (name == L"." || name == L"..") continue;
        std::wstring fullPath = dir + L"\\" + name;

        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            ScanStartMenuFolder(fullPath, results, seen, env);
            continue;
        }

        // Only process .lnk files
        if (name.size() < 5) continue;
        std::wstring ext = name.substr(name.size() - 4);
        if (_wcsicmp(ext.c_str(), L".lnk") != 0) continue;

        // Skip common non-app shortcuts by name
        std::wstring nameLower = name;
        std::transform(nameLower.begin(), nameLower.end(), nameLower.begin(), ::towlower);
        if (nameLower.find(L"uninstall") != std::wstring::npos) continue;
        if (nameLower.find(L"readme") != std::wstring::npos) continue;
        if (nameLower.find(L"help") != std::wstring::npos) continue;
        if (nameLower.find(L"license") != std::wstring::npos) continue;

        ShortcutInfo info;
        if (!ResolveShortcut(fullPath, info)) continue;

        // Only include .exe targets
        if (info.targetPath.size() < 5) continue;
        std::wstring targetExt = info.targetPath.substr(info.targetPath.size() - 4);
        if (_wcsicmp(targetExt.c_str(), L".exe") != 0) continue;

        // Deduplicate by exe path (case-insensitive) so ids match running apps
        std::string id = WideToUtf8(info.targetPath);
        std::string idLower = id;
        std::transform(idLower.begin(), idLower.end(), idLower.begin(), ::tolower);
        if (seen.count(idLower)) continue;
        seen.insert(idLower);

        Napi::Object obj = Napi::Object::New(env);
        obj.Set("name", WideToUtf8(info.name));
        obj.Set("id", id);                // exe path — matches running app ids
        obj.Set("iconPath", id);           // ExtractIconEx from the exe
        results.push_back(obj);
    } while (FindNextFileW(hFind, &fd));
    FindClose(hFind);
}

static Napi::Value GetInstalledApps(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();

    // COM is needed for IShellLink shortcut resolution
    HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    bool comOwned = SUCCEEDED(hr); // S_FALSE means already initialized

    std::vector<Napi::Object> results;
    std::unordered_set<std::string> seen;

    // Scan All Users Start Menu (e.g., C:\ProgramData\Microsoft\Windows\Start Menu\Programs)
    WCHAR commonPath[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_COMMON_PROGRAMS, nullptr, 0, commonPath))) {
        ScanStartMenuFolder(commonPath, results, seen, env);
    }

    // Scan Current User Start Menu (e.g., %APPDATA%\Microsoft\Windows\Start Menu\Programs)
    WCHAR userPath[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_PROGRAMS, nullptr, 0, userPath))) {
        ScanStartMenuFolder(userPath, results, seen, env);
    }

    if (comOwned) CoUninitialize();

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
        arr.Set(idx++, appInfoToNapi(env, collectAppInfo(pInfo.exePath)));
    }
    return arr;
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

    const int outSize = 128;
    HICON hIcon = nullptr;

    // 1. PrivateExtractIconsW — extracts and properly scales from the exe's
    //    icon resources. Avoids the SHIL_JUMBO "small icon in corner" problem
    //    where apps with only 32/48px icons get placed unscaled in a 256x256 slot.
    UINT iconId = 0;
    UINT count = PrivateExtractIconsW(appId.c_str(), 0, outSize, outSize,
                                       &hIcon, &iconId, 1, LR_DEFAULTCOLOR);
    if (count == 0 || count == (UINT)-1 || !hIcon) {
        hIcon = nullptr;
    }

    // 2. SHGetImageList SHIL_EXTRALARGE (48x48) — always fills the slot correctly
    if (!hIcon) {
        SHFILEINFOW sfi = {};
        if (SHGetFileInfoW(appId.c_str(), 0, &sfi, sizeof(sfi), SHGFI_SYSICONINDEX)) {
            IImageList *imgList = nullptr;
            if (SUCCEEDED(SHGetImageList(2 /*SHIL_EXTRALARGE*/, IID_IImageList, (void **)&imgList)) && imgList) {
                imgList->GetIcon(sfi.iIcon, ILD_TRANSPARENT, &hIcon);
                imgList->Release();
            }
        }
    }

    // 3. ExtractIconEx large (32x32)
    if (!hIcon) {
        ExtractIconExW(appId.c_str(), 0, &hIcon, nullptr, 1);
    }
    if (!hIcon) return env.Null();

    Gdiplus::Bitmap iconBmp(hIcon);
    DestroyIcon(hIcon);

    int srcW = (int)iconBmp.GetWidth();
    int srcH = (int)iconBmp.GetHeight();

    Gdiplus::Bitmap target(outSize, outSize, PixelFormat32bppARGB);
    Gdiplus::Graphics g(&target);
    g.SetInterpolationMode(Gdiplus::InterpolationModeHighQualityBicubic);
    g.Clear(Gdiplus::Color(0, 0, 0, 0));
    g.DrawImage(&iconBmp, 0, 0, outSize, outSize);

    // Save to PNG stream
    CLSID pngClsid;
    if (!GetEncoderClsid(L"image/png", &pngClsid)) return env.Null();

    IStream *pStream = nullptr;
    if (FAILED(CreateStreamOnHGlobal(nullptr, TRUE, &pStream)) || !pStream)
        return env.Null();

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
    std::unordered_set<HWND> appHwnds; // collected normal windows (for popup parent lookup)

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

    ctx->windows.push_back(MakeWindowInfo(ctx->env, hwnd, ctx->foregroundHwnd));
    ctx->appHwnds.insert(hwnd);
    return TRUE;
}

// Second-pass callback: collect owned popup/menu windows
static BOOL CALLBACK EnumPopupWindowsProc(HWND hwnd, LPARAM lParam) {
    HWND owner = nullptr;
    if (!IsValidPopupWindow(hwnd, &owner)) return TRUE;

    auto *ctx = reinterpret_cast<EnumWindowsCtx *>(lParam);
    if (ctx->appHwnds.find(owner) == ctx->appHwnds.end()) return TRUE;

    DWORD pid = GetWindowPID(hwnd);
    if (pid == 0) return TRUE;
    if (!ctx->filterExePath.empty()) {
        std::wstring exePath = GetProcessExePath(pid);
        if (_wcsicmp(exePath.c_str(), ctx->filterExePath.c_str()) != 0)
            return TRUE;
    }

    ctx->windows.push_back(MakeWindowInfo(ctx->env, hwnd, ctx->foregroundHwnd, owner));
    return TRUE;
}

static Napi::Value GetWindows(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();

    EnumWindowsCtx ctx(env);
    ctx.foregroundHwnd = GetForegroundWindow();

    if (info.Length() >= 1 && info[0].IsString()) {
        ctx.filterExePath = Utf8ToWide(info[0].As<Napi::String>().Utf8Value());
    }

    // First pass: collect normal app windows
    EnumWindows(EnumWindowsProc, (LPARAM)&ctx);

    // Second pass: collect popup/menu windows owned by the collected app windows
    EnumWindows(EnumPopupWindowsProc, (LPARAM)&ctx);

    Napi::Array arr = Napi::Array::New(env, ctx.windows.size());
    for (size_t i = 0; i < ctx.windows.size(); i++) {
        arr.Set((uint32_t)i, ctx.windows[i]);
    }
    return arr;
}

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

/**
 * Transient windows (context menus, tooltips, popups) must not be activated /
 * brought to the foreground — doing so dismisses the owning app's menu on
 * Windows. We detect them the same way we classify them in DetectPopupWindowType.
 */
static bool IsTransientWindow(HWND hwnd) {
    HWND owner = GetWindow(hwnd, GW_OWNER);
    if (!owner) return false; // top-level → not transient

    WCHAR className[256] = {0};
    GetClassNameW(hwnd, className, 256);
    if (_wcsicmp(className, L"tooltips_class32") == 0) return true;
    if (_wcsicmp(className, L"#32768") == 0) return true; // system menu

    LONG_PTR exStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    // Tool windows and generic popups are transient
    if (exStyle & WS_EX_TOOLWINDOW) return true;
    // Modal dialogs are NOT transient — they want focus
    if (exStyle & WS_EX_DLGMODALFRAME) return false;
    if (_wcsicmp(className, L"#32770") == 0) return false;

    return true; // owned, non-modal → popup → transient
}

// Ensure window is ready to receive input: exists, visible, foreground.
// Returns false if the window no longer exists.
// Only sleeps when the window actually needed to be restored or brought forward.
static bool EnsureWindowReady(HWND hwnd) {
    if (!IsWindow(hwnd)) return false;

    bool needsWait = false;

    // Restore if minimized
    if (IsIconic(hwnd)) {
        ShowWindow(hwnd, SW_RESTORE);
        needsWait = true;
    }

    // Bring to foreground only if not already there
    if (GetForegroundWindow() != hwnd) {
        ForceForegroundWindow(hwnd);
        needsWait = true;
    }

    if (needsWait) {
        // Poll until conditions we changed are met (max 500ms)
        for (int i = 0; i < 25; i++) {
            Sleep(20);
            if (!IsWindow(hwnd)) break;
            if (IsIconic(hwnd)) continue;
            if (IsWindowVisible(hwnd) && GetForegroundWindow() == hwnd) break;
        }
    }
    return true;
}

// Map modifier name to VK code (0 if not recognized)
static WORD ModifierToVK(const std::string &mod) {
    if (mod == "shift") return VK_SHIFT;
    if (mod == "ctrl" || mod == "control") return VK_CONTROL;
    if (mod == "alt" || mod == "option") return VK_MENU;
    if (mod == "cmd" || mod == "command" || mod == "meta") return VK_LWIN;
    return 0;
}

// Create an absolute mouse-move INPUT for a screen point
static INPUT MakeAbsoluteMoveInput(POINT pt) {
    double fScreenWidth = GetSystemMetrics(SM_CXSCREEN) - 1;
    double fScreenHeight = GetSystemMetrics(SM_CYSCREEN) - 1;
    INPUT input = {};
    input.type = INPUT_MOUSE;
    input.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
    input.mi.dx = (LONG)(pt.x * (65535.0 / fScreenWidth));
    input.mi.dy = (LONG)(pt.y * (65535.0 / fScreenHeight));
    return input;
}

// Send modifier keys from payload (press when release=false, release when true)
static void SendModifiers(const Napi::Object &payload, bool release) {
    if (!payload.Has("modifiers") || !payload.Get("modifiers").IsArray()) return;
    Napi::Array mods = payload.Get("modifiers").As<Napi::Array>();
    std::vector<INPUT> inputs;
    for (uint32_t i = 0; i < mods.Length(); i++) {
        WORD vk = ModifierToVK(mods.Get(i).As<Napi::String>().Utf8Value());
        if (vk) {
            INPUT inp = {};
            inp.type = INPUT_KEYBOARD;
            inp.ki.wVk = vk;
            if (release) inp.ki.dwFlags = KEYEVENTF_KEYUP;
            inputs.push_back(inp);
        }
    }
    if (!inputs.empty()) SendInput((UINT)inputs.size(), inputs.data(), sizeof(INPUT));
}

// Get screen point from payload x,y offset relative to window rect
static POINT ScreenPointFromPayload(HWND hwnd, const Napi::Object &payload) {
    double x = payload.Has("x") ? payload.Get("x").As<Napi::Number>().DoubleValue() : 0;
    double y = payload.Has("y") ? payload.Get("y").As<Napi::Number>().DoubleValue() : 0;
    RECT rect;
    GetWindowRect(hwnd, &rect);
    return {rect.left + (LONG)x, rect.top + (LONG)y};
}

static void PostMouseClick(POINT pt, bool isRight) {
    INPUT inputs[3] = {};
    inputs[0] = MakeAbsoluteMoveInput(pt);
    inputs[1].type = INPUT_MOUSE;
    inputs[1].mi.dwFlags = isRight ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
    inputs[2].type = INPUT_MOUSE;
    inputs[2].mi.dwFlags = isRight ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
    SendInput(3, inputs, sizeof(INPUT));
}

static void PostMouseDoubleClick(POINT pt) {
    INPUT inputs[5] = {};
    inputs[0] = MakeAbsoluteMoveInput(pt);
    inputs[1].type = INPUT_MOUSE;
    inputs[1].mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
    inputs[2].type = INPUT_MOUSE;
    inputs[2].mi.dwFlags = MOUSEEVENTF_LEFTUP;
    inputs[3].type = INPUT_MOUSE;
    inputs[3].mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
    inputs[4].type = INPUT_MOUSE;
    inputs[4].mi.dwFlags = MOUSEEVENTF_LEFTUP;
    SendInput(5, inputs, sizeof(INPUT));
}

static void PostMouseDown(POINT pt, bool isRight) {
    INPUT inputs[2] = {};
    inputs[0] = MakeAbsoluteMoveInput(pt);
    inputs[1].type = INPUT_MOUSE;
    inputs[1].mi.dwFlags = isRight ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
    SendInput(2, inputs, sizeof(INPUT));
}

static void PostMouseUp(POINT pt, bool isRight) {
    INPUT inputs[2] = {};
    inputs[0] = MakeAbsoluteMoveInput(pt);
    inputs[1].type = INPUT_MOUSE;
    inputs[1].mi.dwFlags = isRight ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
    SendInput(2, inputs, sizeof(INPUT));
}

static void PostMouseMove(POINT pt) {
    INPUT input = MakeAbsoluteMoveInput(pt);
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
        WORD vk = ModifierToVK(parts[i]);
        if (vk) modVKs.push_back(vk);
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

    // windowId is now optional — if missing or "0", actions are screen-level
    std::string windowIdStr;
    if (payload.Has("windowId") && payload.Get("windowId").IsString()) {
        windowIdStr = payload.Get("windowId").As<Napi::String>().Utf8Value();
    }

    uintptr_t hwndVal = 0;
    if (!windowIdStr.empty()) {
        try {
            hwndVal = (uintptr_t)std::stoull(windowIdStr);
        } catch (const std::exception &) {
            // Invalid windowId — treat as screen-level
            hwndVal = 0;
        }
    }
    HWND hwnd = (HWND)hwndVal;
    bool isScreenLevel = (hwndVal == 0);

    // Helper: get screen point — if windowId is provided, offset from window;
    // if screen-level, x/y are already screen coordinates.
    auto getScreenPt = [&]() -> POINT {
        double x = payload.Has("x") ? payload.Get("x").As<Napi::Number>().DoubleValue() : 0;
        double y = payload.Has("y") ? payload.Get("y").As<Napi::Number>().DoubleValue() : 0;
        if (isScreenLevel) {
            return {(LONG)x, (LONG)y};
        }
        RECT rect;
        GetWindowRect(hwnd, &rect);
        return {rect.left + (LONG)x, rect.top + (LONG)y};
    };

    // For window-specific actions, validate the window exists
    if (!isScreenLevel && !IsWindow(hwnd)) {
        Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
        return env.Null();
    }

    bool skipEnsure = isScreenLevel || IsTransientWindow(hwnd);

    if (action == "focus") {
        if (!isScreenLevel && !skipEnsure) EnsureWindowReady(hwnd);
    }
    else if (action == "minimize") {
        if (!isScreenLevel) ShowWindow(hwnd, SW_MINIMIZE);
    }
    else if (action == "maximize") {
        if (!isScreenLevel) ShowWindow(hwnd, SW_MAXIMIZE);
    }
    else if (action == "restore") {
        if (!isScreenLevel) ShowWindow(hwnd, SW_RESTORE);
    }
    else if (action == "close") {
        if (!isScreenLevel) PostMessageW(hwnd, WM_CLOSE, 0, 0);
    }
    else if (action == "click" || action == "rightClick") {
        if (!isScreenLevel && !skipEnsure && !EnsureWindowReady(hwnd)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        POINT screenPt = getScreenPt();
        SendModifiers(payload, false);
        PostMouseClick(screenPt, action == "rightClick");
        SendModifiers(payload, true);
    }
    else if (action == "doubleClick") {
        if (!isScreenLevel && !skipEnsure && !EnsureWindowReady(hwnd)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        POINT screenPt = getScreenPt();
        SendModifiers(payload, false);
        PostMouseDoubleClick(screenPt);
        SendModifiers(payload, true);
    }
    else if (action == "dragStart") {
        if (!isScreenLevel && !skipEnsure && !EnsureWindowReady(hwnd)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        SendModifiers(payload, false);
        PostMouseDown(getScreenPt(), false);
    }
    else if (action == "dragMove") {
        PostMouseMove(getScreenPt());
    }
    else if (action == "dragEnd") {
        PostMouseUp(getScreenPt(), false);
        SendModifiers(payload, true);
    }
    else if (action == "hover") {
        if (!isScreenLevel && !skipEnsure && !EnsureWindowReady(hwnd)) return env.Undefined();
        PostMouseMove(getScreenPt());
    }
    else if (action == "textInput") {
        if (!isScreenLevel && !skipEnsure && !EnsureWindowReady(hwnd)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string text = payload.Has("text")
            ? payload.Get("text").As<Napi::String>().Utf8Value() : "";
        PostTextInput(text);
    }
    else if (action == "keyInput") {
        if (!isScreenLevel && !skipEnsure && !EnsureWindowReady(hwnd)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string key = payload.Has("key")
            ? payload.Get("key").As<Napi::String>().Utf8Value() : "";
        PostKeyInput(key);
    }
    else if (action == "scroll") {
        if (!isScreenLevel && !skipEnsure && !EnsureWindowReady(hwnd)) return env.Undefined();
        POINT screenPt = getScreenPt();
        int deltaX = payload.Has("scrollDeltaX")
            ? payload.Get("scrollDeltaX").As<Napi::Number>().Int32Value() : 0;
        int deltaY = payload.Has("scrollDeltaY")
            ? payload.Get("scrollDeltaY").As<Napi::Number>().Int32Value() : 0;
        SetCursorPos(screenPt.x, screenPt.y);
        PostScroll(deltaX, deltaY);
    }
    else if (action == "resize") {
        if (!isScreenLevel) {
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
    }
    else {
        Napi::Error::New(env, "Unknown action: " + action).ThrowAsJavaScriptException();
        return env.Null();
    }

    return env.Undefined();
}


// ──────────────────────────────────────────────
// 10. Permissions — no-op on Windows
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
// 11. H.264 stream N-API exports
// ──────────────────────────────────────────────

static Napi::Value StartH264Stream(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Expected (callback)").ThrowAsJavaScriptException();
        return env.Null();
    }
    Napi::Function callback = info[0].As<Napi::Function>();

    if (!IsWGCAvailable()) {
        Napi::Error::New(env, "WGC not available").ThrowAsJavaScriptException();
        return env.Null();
    }

    try {
        stopH264WinStream();
        printf("[H264Win] StartH264Stream (screen capture)\n");
        auto ctx = std::make_shared<H264WinStreamContext>();
        ctx->hwnd = NULL;
        ctx->dpi = 1;
        ctx->tsfn = Napi::ThreadSafeFunction::New(env, callback, "H264WinStreamCB", 0, 1);

        D3D_FEATURE_LEVEL featureLevel;
        HRESULT hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION,
            ctx->d3dDevice.put(), &featureLevel, ctx->d3dContext.put());
        if (FAILED(hr)) { ctx->tsfn.Release(); return env.Null(); }

        auto multithread = ctx->d3dDevice.as<ID3D11Multithread>();
        if (multithread) multithread->SetMultithreadProtected(TRUE);

        auto dxgiDevice = ctx->d3dDevice.as<IDXGIDevice>();
        winrt::com_ptr<IInspectable> inspectable;
        hr = CreateDirect3D11DeviceFromDXGIDevice(dxgiDevice.get(), inspectable.put());
        if (FAILED(hr)) { ctx->tsfn.Release(); return env.Null(); }
        auto d3dDeviceWinRT = inspectable.as<winrt::Windows::Graphics::DirectX::Direct3D11::IDirect3DDevice>();

        auto interop = winrt::get_activation_factory<
            winrt::Windows::Graphics::Capture::GraphicsCaptureItem,
            IGraphicsCaptureItemInterop>();
        winrt::Windows::Graphics::Capture::GraphicsCaptureItem item{nullptr};

        // Full-screen capture: use primary monitor
        HMONITOR hmon = MonitorFromPoint({0, 0}, MONITOR_DEFAULTTOPRIMARY);
        hr = interop->CreateForMonitor(hmon, winrt::guid_of<winrt::Windows::Graphics::Capture::GraphicsCaptureItem>(),
            winrt::put_abi(item));
        if (SUCCEEDED(hr) && item) {
            // Get DPI scaling for the monitor
            UINT dpiX = 96;
            HDC hdc = GetDC(nullptr);
            if (hdc) {
                dpiX = GetDeviceCaps(hdc, LOGPIXELSX);
                ReleaseDC(nullptr, hdc);
            }
            ctx->dpi = (int)((dpiX + 48) / 96); // round to nearest integer scale factor
            if (ctx->dpi < 1) ctx->dpi = 1;
        }
        if (FAILED(hr) || !item) { ctx->tsfn.Release(); return env.Null(); }
        ctx->item = item;

        auto size = item.Size();
        if (size.Width <= 0 || size.Height <= 0) { ctx->tsfn.Release(); return env.Null(); }
        ctx->width = size.Width;
        ctx->height = size.Height;

        ctx->framePool = winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool::CreateFreeThreaded(
            d3dDeviceWinRT, winrt::Windows::Graphics::DirectX::DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2, size);
        ctx->session = ctx->framePool.CreateCaptureSession(item);
        try { ctx->session.IsBorderRequired(false); } catch (...) {}
        try { ctx->session.IsCursorCaptureEnabled(false); } catch (...) {}

        ctx->frameArrivedRevoker = ctx->framePool.FrameArrived(
            winrt::auto_revoke,
            [ctxWeak = std::weak_ptr<H264WinStreamContext>(ctx)](
                auto const& sender, auto const& args) {
                if (auto c = ctxWeak.lock()) c->onFrameArrived(sender, args);
            });

        // Detect capture item closed
        item.Closed([ctxWeak = std::weak_ptr<H264WinStreamContext>(ctx)](
            auto const&, auto const&) {
            auto c = ctxWeak.lock();
            if (!c || c->stopped) return;
            c->stopped = true;
            c->tsfn.NonBlockingCall([](Napi::Env env, Napi::Function cb) {
                cb.Call({Napi::String::New(env, "Capture ended"), env.Null()});
            });
        });

        {
            std::lock_guard<std::mutex> lock(g_h264WinMutex);
            g_mfRefCount++;
        }
        MFStartup(MF_VERSION);
        ctx->session.StartCapture();
        printf("[H264Win] StartCapture called, size=%dx%d\n", ctx->width, ctx->height);

        {
            std::lock_guard<std::mutex> lock(g_h264WinMutex);
            g_h264WinStream = ctx;
        }

        Napi::Object result = Napi::Object::New(env);
        result.Set("width", ctx->width);
        result.Set("height", ctx->height);
        result.Set("dpi", ctx->dpi);
        return result;
    } catch (std::exception const& ex) {
        printf("[H264Win] StartH264Stream exception: %s\n", ex.what());
        return env.Null();
    } catch (...) {
        printf("[H264Win] StartH264Stream unknown exception\n");
        return env.Null();
    }
}

static Napi::Value StopH264Stream(const Napi::CallbackInfo &info) {
    stopH264WinStream();
    return info.Env().Undefined();
}

static Napi::Value SetStreamFps(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) return env.Undefined();
    int fps = info[0].As<Napi::Number>().Int32Value();
    if (fps < 1 || fps > 120) return env.Undefined();

    std::lock_guard<std::mutex> lock(g_h264WinMutex);
    if (!g_h264WinStream) return env.Undefined();
    auto &ctx = g_h264WinStream;
    std::lock_guard<std::mutex> ctxLock(ctx->mutex);
    ctx->targetFps = fps;
    auto codecApi = ctx->encoder.try_as<ICodecAPI>();
    if (codecApi) {
        VARIANT v;
        VariantInit(&v);
        v.vt = VT_UI4; v.ulVal = (ULONG)(fps * 10);
        codecApi->SetValue(&CODECAPI_AVEncMPVGOPSize, &v);
    }
    return env.Undefined();
}

static Napi::Value SetStreamBitrate(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) return env.Undefined();
    int bitrate = info[0].As<Napi::Number>().Int32Value();
    if (bitrate < 100000) return env.Undefined();

    std::lock_guard<std::mutex> lock(g_h264WinMutex);
    if (!g_h264WinStream) return env.Undefined();
    auto &ctx = g_h264WinStream;
    std::lock_guard<std::mutex> ctxLock(ctx->mutex);
    ctx->targetBitrate = bitrate;
    auto codecApi = ctx->encoder.try_as<ICodecAPI>();
    if (codecApi) {
        VARIANT v;
        VariantInit(&v);
        v.vt = VT_UI4; v.ulVal = (ULONG)bitrate;
        codecApi->SetValue(&CODECAPI_AVEncCommonMeanBitRate, &v);
    }
    return env.Undefined();
}

// ──────────────────────────────────────────────
// Screenshot a window by HWND → base64 PNG data URI
// ──────────────────────────────────────────────

static std::string EncodeBitmapToJpegBase64(HBITMAP hBitmap) {
    if (!hBitmap) return "";

    Gdiplus::Bitmap bmp(hBitmap, nullptr);
    if (bmp.GetLastStatus() != Gdiplus::Ok) return "";

    // Find JPEG encoder CLSID
    CLSID clsid;
    {
        UINT num = 0, sz = 0;
        Gdiplus::GetImageEncodersSize(&num, &sz);
        if (sz == 0) return "";
        auto buf = std::make_unique<uint8_t[]>(sz);
        auto encoders = reinterpret_cast<Gdiplus::ImageCodecInfo*>(buf.get());
        Gdiplus::GetImageEncoders(num, sz, encoders);
        bool found = false;
        for (UINT i = 0; i < num; i++) {
            if (wcscmp(encoders[i].MimeType, L"image/jpeg") == 0) {
                clsid = encoders[i].Clsid;
                found = true;
                break;
            }
        }
        if (!found) return "";
    }

    // Encode to in-memory stream
    IStream* pStream = nullptr;
    if (FAILED(CreateStreamOnHGlobal(nullptr, TRUE, &pStream))) return "";
    if (bmp.Save(pStream, &clsid, nullptr) != Gdiplus::Ok) { pStream->Release(); return "";

    }

    // Read bytes
    STATSTG stat;
    pStream->Stat(&stat, STATFLAG_NONAME);
    ULONG dataSize = (ULONG)stat.cbSize.QuadPart;
    LARGE_INTEGER zero = {};
    pStream->Seek(zero, STREAM_SEEK_SET, nullptr);
    auto data = std::make_unique<BYTE[]>(dataSize);
    ULONG read = 0;
    pStream->Read(data.get(), dataSize, &read);
    pStream->Release();

    // Base64 encode
    DWORD b64Len = 0;
    CryptBinaryToStringA(data.get(), read, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr, &b64Len);
    std::string b64(b64Len, '\0');
    CryptBinaryToStringA(data.get(), read, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, &b64[0], &b64Len);
    b64.resize(b64Len);

    return "data:image/jpeg;base64," + b64;
}

static Napi::Value ScreenshotWindow(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) return env.Null();

    uintptr_t hwndVal = (uintptr_t)info[0].As<Napi::Number>().Int64Value();
    HWND hwnd = (HWND)hwndVal;
    if (!IsWindow(hwnd)) return env.Null();

    RECT rect;
    GetWindowRect(hwnd, &rect);
    int w = rect.right - rect.left;
    int h = rect.bottom - rect.top;
    if (w <= 0 || h <= 0) return env.Null();

    HDC hdcWindow = GetDC(hwnd);
    if (!hdcWindow) return env.Null();
    HDC hdcMem = CreateCompatibleDC(hdcWindow);
    HBITMAP hBitmap = CreateCompatibleBitmap(hdcWindow, w, h);
    HGDIOBJ hOld = SelectObject(hdcMem, hBitmap);

    // Use PrintWindow for accurate capture (works with DWM composition)
    if (!PrintWindow(hwnd, hdcMem, PW_RENDERFULLCONTENT)) {
        // Fallback to BitBlt
        BitBlt(hdcMem, 0, 0, w, h, hdcWindow, 0, 0, SRCCOPY);
    }

    SelectObject(hdcMem, hOld);
    DeleteDC(hdcMem);
    ReleaseDC(hwnd, hdcWindow);

    std::string dataUri = EncodeBitmapToJpegBase64(hBitmap);
    DeleteObject(hBitmap);

    if (dataUri.empty()) return env.Null();
    return Napi::String::New(env, dataUri);
}

// ──────────────────────────────────────────────
// Module init
// ──────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    EnsureGdiPlus();
    exports.Set("getInstalledApps", Napi::Function::New(env, GetInstalledApps));
    exports.Set("getRunningApps", Napi::Function::New(env, GetRunningApps));
    exports.Set("launchApp", Napi::Function::New(env, LaunchApp));
    exports.Set("quitApp", Napi::Function::New(env, QuitApp));
    exports.Set("getAppIcon", Napi::Function::New(env, GetAppIcon));
    exports.Set("getWindows", Napi::Function::New(env, GetWindows));
    exports.Set("performAction", Napi::Function::New(env, PerformAction));
    exports.Set("hasScreenRecordingPermission", Napi::Function::New(env, HasScreenRecordingPermission));
    exports.Set("hasAccessibilityPermission", Napi::Function::New(env, HasAccessibilityPermission));
    exports.Set("requestScreenRecordingPermission", Napi::Function::New(env, RequestScreenRecordingPermission));
    exports.Set("requestAccessibilityPermission", Napi::Function::New(env, RequestAccessibilityPermission));
    exports.Set("startH264Stream", Napi::Function::New(env, StartH264Stream));
    exports.Set("stopH264Stream", Napi::Function::New(env, StopH264Stream));
    exports.Set("setStreamFps", Napi::Function::New(env, SetStreamFps));
    exports.Set("setStreamBitrate", Napi::Function::New(env, SetStreamBitrate));
    exports.Set("screenshotWindow", Napi::Function::New(env, ScreenshotWindow));
    return exports;
}

NODE_API_MODULE(AppsWin, Init)
