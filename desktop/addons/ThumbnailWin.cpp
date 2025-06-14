#include <napi.h>
#include <windows.h>
#include <shlwapi.h>
#include <shobjidl.h>
#include <gdiplus.h>
#include <vector>
#include <sstream>

#pragma comment(lib, "gdiplus.lib")

static ULONG_PTR gdiplusToken;
static bool isInitialized = false;

void SaveHBitmapToJPEGStream(HBITMAP hBitmap, IStream* pStream, ULONG quality = 80) {
    Gdiplus::Bitmap bitmap(hBitmap, NULL);
    CLSID jpegClsid;
    CLSIDFromString(L"{557CF401-1A04-11D3-9A73-0000F81EF32E}", &jpegClsid);

    Gdiplus::EncoderParameters encoderParams;
    encoderParams.Count = 1;
    encoderParams.Parameter[0].Guid = Gdiplus::EncoderQuality;
    encoderParams.Parameter[0].Type = Gdiplus::EncoderParameterValueTypeLong;
    encoderParams.Parameter[0].NumberOfValues = 1;
    encoderParams.Parameter[0].Value = &quality;

    Gdiplus::Status status = bitmap.Save(pStream, &jpegClsid, &encoderParams);
    if (status != Gdiplus::Ok) {
        throw std::runtime_error("Failed to encode the image as JPEG.");
    }
}

std::vector<unsigned char> GenerateThumbnail(const std::wstring& filePath) {
    if (!isInitialized) {
        throw std::runtime_error("generateThumbnail called before setup(). Call setup() first.");
    }

    IShellItemImageFactory* pImageFactory = nullptr;
    HRESULT hr = SHCreateItemFromParsingName(filePath.c_str(), NULL, IID_PPV_ARGS(&pImageFactory));
    if (FAILED(hr)) {
        throw std::runtime_error("SHCreateItemFromParsingName failed: Invalid file path or unsupported file type.");
    }

    SIZE size = {128, 128}; // Thumbnail size
    HBITMAP hBitmap;
    hr = pImageFactory->GetImage(size, SIIGBF_RESIZETOFIT, &hBitmap);
    if (FAILED(hr)) {
        pImageFactory->Release();
        throw std::runtime_error("Failed to retrieve thumbnail image from the file.");
    }

    IStream* pStream = NULL;
    CreateStreamOnHGlobal(NULL, TRUE, &pStream);
    if (!pStream) {
        DeleteObject(hBitmap);
        pImageFactory->Release();
        throw std::runtime_error("Failed to create an in-memory stream.");
    }

    try {
        SaveHBitmapToJPEGStream(hBitmap, pStream);
    } catch (const std::exception& e) {
        pStream->Release();
        DeleteObject(hBitmap);
        pImageFactory->Release();
        throw;
    }

    // Read JPEG data from the stream
    LARGE_INTEGER liZero = {};
    pStream->Seek(liZero, STREAM_SEEK_SET, NULL);
    STATSTG statstg;
    pStream->Stat(&statstg, STATFLAG_NONAME);
    ULONG dataSize = static_cast<ULONG>(statstg.cbSize.QuadPart);

    std::vector<unsigned char> jpegData(dataSize);
    ULONG bytesRead;
    pStream->Read(jpegData.data(), dataSize, &bytesRead);

    pStream->Release();
    DeleteObject(hBitmap);
    pImageFactory->Release();

    if (bytesRead != dataSize) {
        throw std::runtime_error("Failed to read JPEG data from memory stream.");
    }

    return jpegData;
}

// **N-API Methods**

Napi::Value Setup(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!isInitialized) {
        HRESULT hr = CoInitialize(NULL);
        if (FAILED(hr)) {
            Napi::Error::New(env, "Failed to initialize COM.").ThrowAsJavaScriptException();
            return env.Null();
        }

        Gdiplus::GdiplusStartupInput gdiplusStartupInput;
        Gdiplus::GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, NULL);
        isInitialized = true;
    }

    return env.Undefined();
}

Napi::Value Stop(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (isInitialized) {
        Gdiplus::GdiplusShutdown(gdiplusToken);
        CoUninitialize();
        isInitialized = false;
    }

    return env.Undefined();
}

Napi::Value GenerateThumbnailWrapper(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "File path must be a string.").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string filePathUtf8 = info[0].As<Napi::String>().Utf8Value();
    std::wstring filePath(filePathUtf8.begin(), filePathUtf8.end());

    try {
        std::vector<unsigned char> thumbnailData = GenerateThumbnail(filePath);
        return Napi::Buffer<unsigned char>::Copy(env, thumbnailData.data(), thumbnailData.size());
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

// **Initialize the module**
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("setup", Napi::Function::New(env, Setup));
    exports.Set("stop", Napi::Function::New(env, Stop));
    exports.Set("generateThumbnail", Napi::Function::New(env, GenerateThumbnailWrapper));
    return exports;
}

NODE_API_MODULE(ThumbnailWin, Init)
