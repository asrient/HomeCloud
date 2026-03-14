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

// Build a Napi window-info object from an HWND.
// For owned/popup windows pass the owner HWND; for top-level windows pass nullptr.
static Napi::Object MakeWindowInfo(Napi::Env env, HWND hwnd, HWND foregroundHwnd,
                                    HWND ownerHwnd = nullptr) {
    WCHAR title[512] = {0};
    GetWindowTextW(hwnd, title, 512);

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("id", std::to_string((uintptr_t)hwnd));
    obj.Set("title", WideToUtf8(title));
    obj.Set("type", ownerHwnd ? DetectPopupWindowType(hwnd) : DetectWindowType(hwnd));
    obj.Set("isFocused", hwnd == foregroundHwnd);
    obj.Set("isHidden", ownerHwnd ? false : (bool)!IsWindowVisible(hwnd));
    obj.Set("isMinimized", ownerHwnd ? false : (bool)IsIconic(hwnd));
    obj.Set("isMaximized", ownerHwnd ? false : (bool)IsZoomed(hwnd));
    RECT wndrect;
    if (GetWindowRect(hwnd, &wndrect)) {
        obj.Set("x", (double)wndrect.left);
        obj.Set("y", (double)wndrect.top);
        obj.Set("width", (double)(wndrect.right - wndrect.left));
        obj.Set("height", (double)(wndrect.bottom - wndrect.top));
    } else {
        obj.Set("x", 0.0);
        obj.Set("y", 0.0);
        obj.Set("width", 0.0);
        obj.Set("height", 0.0);
    }
    if (ownerHwnd) {
        obj.Set("parentWindowId", std::to_string((uintptr_t)ownerHwnd));
    }
    return obj;
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
    std::mutex mutex;

    // WGC
    winrt::Windows::Graphics::Capture::GraphicsCaptureItem item{nullptr};
    winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool framePool{nullptr};
    winrt::Windows::Graphics::Capture::GraphicsCaptureSession session{nullptr};
    winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool::FrameArrived_revoker frameArrivedRevoker;

    // D3D11
    winrt::com_ptr<ID3D11Device> d3dDevice;
    winrt::com_ptr<ID3D11DeviceContext> d3dContext;

    // MF pipeline: Video Processor (BGRA→NV12 on GPU) → H.264 encoder
    winrt::com_ptr<IMFTransform> videoProcessor;
    winrt::com_ptr<IMFTransform> encoder;
    winrt::com_ptr<IMFDXGIDeviceManager> dxgiManager;
    UINT dxgiResetToken = 0;
    DWORD encInputStreamId = 0;
    DWORD encOutputStreamId = 0;

    // N-API callback
    Napi::ThreadSafeFunction tsfn;

    bool initPipeline(int w, int h) {
        // NV12 and H.264 require even dimensions — round up
        w = (w + 1) & ~1;
        h = (h + 1) & ~1;

        videoProcessor = nullptr;
        encoder = nullptr;

        // Create DXGI Device Manager to share D3D11 device between MFTs
        HRESULT hr = MFCreateDXGIDeviceManager(&dxgiResetToken, dxgiManager.put());
        if (FAILED(hr)) { printf("[H264Win] initPipeline: MFCreateDXGIDeviceManager failed 0x%08lX\n", hr); return false; }
        hr = dxgiManager->ResetDevice(d3dDevice.get(), dxgiResetToken);
        if (FAILED(hr)) { printf("[H264Win] initPipeline: ResetDevice failed 0x%08lX\n", hr); return false; }

        // ── Video Processor MFT (BGRA → NV12, GPU) ──
        hr = CoCreateInstance(CLSID_VideoProcessorMFT, nullptr, CLSCTX_INPROC_SERVER,
            IID_PPV_ARGS(videoProcessor.put()));
        if (FAILED(hr)) { printf("[H264Win] initPipeline: CoCreateInstance VP failed 0x%08lX\n", hr); return false; }

        // Enable D3D11 on the video processor
        videoProcessor->ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER,
            (ULONG_PTR)dxgiManager.get());

        // VP input type: ARGB32 (BGRA)
        winrt::com_ptr<IMFMediaType> vpInType;
        MFCreateMediaType(vpInType.put());
        vpInType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
        vpInType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_ARGB32);
        MFSetAttributeSize(vpInType.get(), MF_MT_FRAME_SIZE, w, h);
        MFSetAttributeRatio(vpInType.get(), MF_MT_FRAME_RATE, targetFps, 1);
        vpInType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
        hr = videoProcessor->SetInputType(0, vpInType.get(), 0);
        if (FAILED(hr)) { printf("[H264Win] initPipeline: VP SetInputType failed 0x%08lX\n", hr); videoProcessor = nullptr; return false; }

        // VP output type: NV12
        winrt::com_ptr<IMFMediaType> vpOutType;
        MFCreateMediaType(vpOutType.put());
        vpOutType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
        vpOutType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_NV12);
        MFSetAttributeSize(vpOutType.get(), MF_MT_FRAME_SIZE, w, h);
        MFSetAttributeRatio(vpOutType.get(), MF_MT_FRAME_RATE, targetFps, 1);
        vpOutType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
        hr = videoProcessor->SetOutputType(0, vpOutType.get(), 0);
        if (FAILED(hr)) { printf("[H264Win] initPipeline: VP SetOutputType failed 0x%08lX\n", hr); videoProcessor = nullptr; return false; }

        videoProcessor->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0);

        // ── H.264 Encoder MFT ──
        MFT_REGISTER_TYPE_INFO encOutInfo = { MFMediaType_Video, MFVideoFormat_H264 };
        IMFActivate **ppActivate = nullptr;
        UINT32 count = 0;
        hr = MFTEnumEx(MFT_CATEGORY_VIDEO_ENCODER,
            MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER,
            nullptr, &encOutInfo, &ppActivate, &count);
        if (FAILED(hr) || count == 0) {
            hr = MFTEnumEx(MFT_CATEGORY_VIDEO_ENCODER,
                MFT_ENUM_FLAG_SYNCMFT | MFT_ENUM_FLAG_SORTANDFILTER,
                nullptr, &encOutInfo, &ppActivate, &count);
        }
        if (FAILED(hr) || count == 0) { printf("[H264Win] initPipeline: MFTEnumEx failed hr=0x%08lX count=%u\n", hr, count); return false; }

        hr = ppActivate[0]->ActivateObject(IID_PPV_ARGS(encoder.put()));
        for (UINT32 i = 0; i < count; i++) ppActivate[i]->Release();
        CoTaskMemFree(ppActivate);
        if (FAILED(hr)) return false;

        // Enable D3D11 on encoder too
        encoder->ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER,
            (ULONG_PTR)dxgiManager.get());

        // Low latency, no B-frames, zero pipeline delay
        auto codecApi = encoder.try_as<ICodecAPI>();
        if (codecApi) {
            VARIANT v;
            VariantInit(&v);
            // Low latency mode — equivalent of VT RealTime + MaxFrameDelayCount=0
            v.vt = VT_BOOL; v.boolVal = VARIANT_TRUE;
            codecApi->SetValue(&CODECAPI_AVLowLatencyMode, &v);
            // No B-frames — equivalent of VT AllowFrameReordering=false
            v.vt = VT_UI4; v.ulVal = 0;
            codecApi->SetValue(&CODECAPI_AVEncMPVDefaultBPictureCount, &v);
            // Keyframe every 10 seconds
            v.vt = VT_UI4; v.ulVal = (ULONG)(targetFps * 10);
            codecApi->SetValue(&CODECAPI_AVEncMPVGOPSize, &v);
        }

        // Encoder output type (H.264)
        winrt::com_ptr<IMFMediaType> encOutType;
        MFCreateMediaType(encOutType.put());
        encOutType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
        encOutType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_H264);
        encOutType->SetUINT32(MF_MT_AVG_BITRATE, targetBitrate);
        MFSetAttributeRatio(encOutType.get(), MF_MT_FRAME_RATE, targetFps, 1);
        MFSetAttributeSize(encOutType.get(), MF_MT_FRAME_SIZE, w, h);
        encOutType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
        encOutType->SetUINT32(MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_Main);
        hr = encoder->SetOutputType(0, encOutType.get(), 0);
        if (FAILED(hr)) { encoder = nullptr; return false; }

        // Encoder input type (NV12)
        winrt::com_ptr<IMFMediaType> encInType;
        MFCreateMediaType(encInType.put());
        encInType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
        encInType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_NV12);
        MFSetAttributeRatio(encInType.get(), MF_MT_FRAME_RATE, targetFps, 1);
        MFSetAttributeSize(encInType.get(), MF_MT_FRAME_SIZE, w, h);
        encInType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
        hr = encoder->SetInputType(0, encInType.get(), 0);
        if (FAILED(hr)) { encoder = nullptr; return false; }

        hr = encoder->GetStreamIDs(1, &encInputStreamId, 1, &encOutputStreamId);
        if (hr == E_NOTIMPL) { encInputStreamId = 0; encOutputStreamId = 0; }

        encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0);
        encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0);

        return true;
    }

    void onFrameArrived(
        winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool const& sender,
        winrt::Windows::Foundation::IInspectable const&)
    {
        auto frame = sender.TryGetNextFrame();
        if (!frame) { printf("[H264Win] onFrameArrived: TryGetNextFrame returned null\n"); return; }

        std::lock_guard<std::mutex> lock(mutex);
        if (stopped) { return; }

        auto surface = frame.Surface();
        if (!surface) { printf("[H264Win] onFrameArrived: no surface\n"); return; }

        auto access = surface.as<Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
        winrt::com_ptr<ID3D11Texture2D> frameTex;
        access->GetInterface(IID_PPV_ARGS(frameTex.put()));
        if (!frameTex) { printf("[H264Win] onFrameArrived: no texture\n"); return; }

        D3D11_TEXTURE2D_DESC desc;
        frameTex->GetDesc(&desc);
        int w = (int)desc.Width;
        int h = (int)desc.Height;

        // Create/recreate pipeline if dimensions changed
        if (w != width || h != height || !encoder) {
            printf("[H264Win] initPipeline: %dx%d (was %dx%d)\n", w, h, width, height);
            width = w;
            height = h;
            isFirstFrame = true;
            if (!initPipeline(w, h)) { printf("[H264Win] initPipeline FAILED\n"); return; }
        }

        // Create IMFSample wrapping the D3D11 texture (zero-copy)
        winrt::com_ptr<IMFMediaBuffer> texBuf;
        MFCreateDXGISurfaceBuffer(__uuidof(ID3D11Texture2D), frameTex.get(), 0, FALSE, texBuf.put());
        if (!texBuf) return;

        winrt::com_ptr<IMFSample> inputSample;
        MFCreateSample(inputSample.put());
        inputSample->AddBuffer(texBuf.get());
        LONGLONG now = MFGetSystemTime();
        inputSample->SetSampleTime(now);
        inputSample->SetSampleDuration(10000000LL / targetFps);

        // Step 1: Video Processor (BGRA → NV12 on GPU)
        HRESULT hr = videoProcessor->ProcessInput(0, inputSample.get(), 0);
        if (FAILED(hr)) { printf("[H264Win] VP ProcessInput failed: 0x%08lX\n", hr); return; }

        MFT_OUTPUT_DATA_BUFFER vpOutput = {};
        vpOutput.dwStreamID = 0;
        DWORD vpStatus = 0;
        hr = videoProcessor->ProcessOutput(0, 1, &vpOutput, &vpStatus);
        if (FAILED(hr) || !vpOutput.pSample) {
            printf("[H264Win] VP ProcessOutput failed: 0x%08lX\n", hr);
            if (vpOutput.pEvents) vpOutput.pEvents->Release();
            return;
        }

        // Step 2: H.264 Encoder (NV12 → H.264)
        hr = encoder->ProcessInput(encInputStreamId, vpOutput.pSample, 0);
        vpOutput.pSample->Release();
        if (vpOutput.pEvents) vpOutput.pEvents->Release();
        if (FAILED(hr)) { printf("[H264Win] Encoder ProcessInput failed: 0x%08lX\n", hr); return; }

        // Drain encoded output
        MFT_OUTPUT_DATA_BUFFER encOutput = {};
        encOutput.dwStreamID = encOutputStreamId;
        winrt::com_ptr<IMFSample> outSample;
        MFCreateSample(outSample.put());
        winrt::com_ptr<IMFMediaBuffer> outBuf;
        MFCreateMemoryBuffer(w * h, outBuf.put());
        outSample->AddBuffer(outBuf.get());
        encOutput.pSample = outSample.get();

        DWORD encStatus = 0;
        hr = encoder->ProcessOutput(0, 1, &encOutput, &encStatus);
        if (encOutput.pEvents) encOutput.pEvents->Release();

        if (hr == MF_E_TRANSFORM_NEED_MORE_INPUT) return;
        if (FAILED(hr)) { printf("[H264Win] Encoder ProcessOutput failed: 0x%08lX\n", hr); return; }

        // Extract encoded H.264 data
        winrt::com_ptr<IMFMediaBuffer> encBuf;
        encOutput.pSample->ConvertToContiguousBuffer(encBuf.put());
        BYTE *encData = nullptr;
        DWORD encLen = 0;
        encBuf->Lock(&encData, nullptr, &encLen);

        if (encData && encLen > 0) {
            UINT32 picType = 0;
            bool kf = false;
            if (SUCCEEDED(encOutput.pSample->GetUINT32(
                MFSampleExtension_VideoEncodePictureType, &picType))) {
                kf = (picType == eAVEncH264PictureType_IDR);
            }
            if (isFirstFrame) { kf = true; isFirstFrame = false; }

            int cw = width, ch = height, cdpi = dpi;
            bool first = isFirstFrame;
            double ts = (double)now / 10000.0;

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
    }
};

static std::mutex g_h264WinMutex;
static std::unordered_map<uintptr_t, std::shared_ptr<H264WinStreamContext>> g_h264WinStreams;
static int g_mfRefCount = 0;  // reference count for MFStartup/MFShutdown

static void stopH264WinStream(HWND hwnd) {
    std::shared_ptr<H264WinStreamContext> ctx;
    {
        std::lock_guard<std::mutex> lock(g_h264WinMutex);
        auto it = g_h264WinStreams.find((uintptr_t)hwnd);
        if (it == g_h264WinStreams.end()) return;
        ctx = it->second;
        g_h264WinStreams.erase(it);
    }
    printf("[H264Win] stopH264WinStream: hwnd=%p\n", (void*)hwnd);
    {
        std::lock_guard<std::mutex> lock(ctx->mutex);
        ctx->stopped = true;
    }
    ctx->frameArrivedRevoker.revoke();
    // Flush and release MF encoder
    if (ctx->encoder) {
        ctx->encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, 0);
        ctx->encoder->ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN, 0);
        ctx->encoder = nullptr;
    }
    if (ctx->videoProcessor) {
        ctx->videoProcessor = nullptr;
    }
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
    if (!IsWindowVisible(hwnd)) return TRUE;

    HWND owner = GetWindow(hwnd, GW_OWNER);
    if (owner == nullptr) return TRUE; // not an owned window

    auto *ctx = reinterpret_cast<EnumWindowsCtx *>(lParam);

    // Only include if owner is one of our collected app windows
    if (ctx->appHwnds.find(owner) == ctx->appHwnds.end()) return TRUE;

    // Skip cloaked
    BOOL cloaked = FALSE;
    DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &cloaked, sizeof(cloaked));
    if (cloaked) return TRUE;

    // Skip tiny windows (< 2px)
    RECT rect;
    if (!GetWindowRect(hwnd, &rect)) return TRUE;
    if (rect.right - rect.left < 2 || rect.bottom - rect.top < 2) return TRUE;

    // Filter by exe path if needed
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

    bool skipEnsure = IsTransientWindow(hwnd);

    if (action == "focus") {
        if (!skipEnsure) EnsureWindowReady(hwnd);
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
        if (!skipEnsure && !EnsureWindowReady(hwnd)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        POINT screenPt = ScreenPointFromPayload(hwnd, payload);
        SendModifiers(payload, false);
        PostMouseClick(screenPt, action == "rightClick");
        SendModifiers(payload, true);
    }
    else if (action == "doubleClick") {
        if (!skipEnsure && !EnsureWindowReady(hwnd)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        POINT screenPt = ScreenPointFromPayload(hwnd, payload);
        SendModifiers(payload, false);
        PostMouseDoubleClick(screenPt);
        SendModifiers(payload, true);
    }
    else if (action == "dragStart") {
        if (!skipEnsure && !EnsureWindowReady(hwnd)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        SendModifiers(payload, false);
        PostMouseDown(ScreenPointFromPayload(hwnd, payload), false);
    }
    else if (action == "dragMove") {
        PostMouseMove(ScreenPointFromPayload(hwnd, payload));
    }
    else if (action == "dragEnd") {
        PostMouseUp(ScreenPointFromPayload(hwnd, payload), false);
        SendModifiers(payload, true);
    }
    else if (action == "hover") {
        if (!skipEnsure && !EnsureWindowReady(hwnd)) return env.Undefined();
        PostMouseMove(ScreenPointFromPayload(hwnd, payload));
    }
    else if (action == "textInput") {
        if (!skipEnsure && !EnsureWindowReady(hwnd)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string text = payload.Has("text")
            ? payload.Get("text").As<Napi::String>().Utf8Value() : "";
        PostTextInput(text);
    }
    else if (action == "keyInput") {
        if (!skipEnsure && !EnsureWindowReady(hwnd)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string key = payload.Has("key")
            ? payload.Get("key").As<Napi::String>().Utf8Value() : "";
        PostKeyInput(key);
    }
    else if (action == "scroll") {
        if (!skipEnsure && !EnsureWindowReady(hwnd)) return env.Undefined();
        POINT screenPt = ScreenPointFromPayload(hwnd, payload);
        int deltaX = payload.Has("scrollDeltaX")
            ? payload.Get("scrollDeltaX").As<Napi::Number>().Int32Value() : 0;
        int deltaY = payload.Has("scrollDeltaY")
            ? payload.Get("scrollDeltaY").As<Napi::Number>().Int32Value() : 0;
        SetCursorPos(screenPt.x, screenPt.y);
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
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected (windowId, callback)").ThrowAsJavaScriptException();
        return env.Null();
    }
    uintptr_t hwndVal = (uintptr_t)info[0].As<Napi::Number>().Int64Value();
    HWND hwnd = (HWND)hwndVal;
    Napi::Function callback = info[1].As<Napi::Function>();

    // Bring the window to front / restore if minimized before streaming
    // EnsureWindowReady(hwnd);

    if (!IsWGCAvailable() || !IsWindow(hwnd)) {
        Napi::Error::New(env, "WGC not available or invalid window").ThrowAsJavaScriptException();
        return env.Null();
    }

    try {
        stopH264WinStream(hwnd);
        printf("[H264Win] StartH264Stream: hwnd=%p\\n", (void*)hwnd);
        auto ctx = std::make_shared<H264WinStreamContext>();
        ctx->hwnd = hwnd;
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
        hr = interop->CreateForWindow(hwnd, winrt::guid_of<winrt::Windows::Graphics::Capture::GraphicsCaptureItem>(),
            winrt::put_abi(item));
        if (FAILED(hr) || !item) { ctx->tsfn.Release(); return env.Null(); }
        ctx->item = item;

        auto size = item.Size();
        if (size.Width <= 0 || size.Height <= 0) { ctx->tsfn.Release(); return env.Null(); }
        ctx->width = size.Width;
        ctx->height = size.Height;

        ctx->framePool = winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool::CreateFreeThreaded(
            d3dDeviceWinRT, winrt::Windows::Graphics::DirectX::DirectXPixelFormat::B8G8R8A8UIntNormalized,
            1, size);
        ctx->session = ctx->framePool.CreateCaptureSession(item);
        try { ctx->session.IsBorderRequired(false); } catch (...) {}
        try { ctx->session.IsCursorCaptureEnabled(false); } catch (...) {}

        ctx->frameArrivedRevoker = ctx->framePool.FrameArrived(
            winrt::auto_revoke,
            [ctxWeak = std::weak_ptr<H264WinStreamContext>(ctx)](
                auto const& sender, auto const& args) {
                if (auto c = ctxWeak.lock()) c->onFrameArrived(sender, args);
            });

        // Detect window close via GraphicsCaptureItem.Closed
        item.Closed([ctxWeak = std::weak_ptr<H264WinStreamContext>(ctx)](
            auto const&, auto const&) {
            auto c = ctxWeak.lock();
            if (!c || c->stopped) return;
            c->stopped = true;
            c->tsfn.NonBlockingCall([](Napi::Env env, Napi::Function cb) {
                cb.Call({Napi::String::New(env, "Window closed"), env.Null()});
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
            g_h264WinStreams[(uintptr_t)hwnd] = ctx;
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
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) return env.Undefined();
    stopH264WinStream((HWND)(uintptr_t)info[0].As<Napi::Number>().Int64Value());
    return env.Undefined();
}

static Napi::Value SetStreamFps(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) return env.Undefined();
    uintptr_t hwndVal = (uintptr_t)info[0].As<Napi::Number>().Int64Value();
    int fps = info[1].As<Napi::Number>().Int32Value();
    if (fps < 1 || fps > 120) return env.Undefined();

    std::lock_guard<std::mutex> lock(g_h264WinMutex);
    auto it = g_h264WinStreams.find(hwndVal);
    if (it == g_h264WinStreams.end()) return env.Undefined();
    auto &ctx = it->second;
    std::lock_guard<std::mutex> ctxLock(ctx->mutex);
    ctx->targetFps = fps;
    // Update MF encoder GOP size
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
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) return env.Undefined();
    uintptr_t hwndVal = (uintptr_t)info[0].As<Napi::Number>().Int64Value();
    int bitrate = info[1].As<Napi::Number>().Int32Value();
    if (bitrate < 100000) return env.Undefined();

    std::lock_guard<std::mutex> lock(g_h264WinMutex);
    auto it = g_h264WinStreams.find(hwndVal);
    if (it == g_h264WinStreams.end()) return env.Undefined();
    auto &ctx = it->second;
    std::lock_guard<std::mutex> ctxLock(ctx->mutex);
    ctx->targetBitrate = bitrate;
    // Update MF encoder bitrate
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
    return exports;
}

NODE_API_MODULE(AppsWin, Init)
