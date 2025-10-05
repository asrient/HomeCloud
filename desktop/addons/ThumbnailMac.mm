#include <napi.h>
#import <QuickLookThumbnailing/QuickLookThumbnailing.h>
#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <QuickLook/QuickLook.h>


// Async Worker to handle thumbnail generation
class ThumbnailWorker : public Napi::AsyncWorker {
public:
    ThumbnailWorker(const Napi::Function& callback, std::string filePath, CGSize thumbnailSize)
        : Napi::AsyncWorker(callback), filePath(filePath), thumbnailSize(thumbnailSize) {}

    void Execute() override {
    @autoreleasepool {
        NSString *filePathNSString = [NSString stringWithUTF8String:filePath.c_str()];
        NSURL *fileURL = [NSURL fileURLWithPath:filePathNSString];
        CGRect thumbnailRect = CGRectMake(0, 0, thumbnailSize.width, thumbnailSize.height);
        NSDictionary *options = @{
            (__bridge NSString *)kQLThumbnailOptionIconModeKey: @NO
        };

        // Create thumbnail using older API
        CGImageRef thumbnailRef = QLThumbnailImageCreate(kCFAllocatorDefault, (__bridge CFURLRef)fileURL, thumbnailSize, (__bridge CFDictionaryRef)options);

        if (thumbnailRef) {
            NSBitmapImageRep *imageRep = [[NSBitmapImageRep alloc] initWithCGImage:thumbnailRef];
            NSDictionary *jpegProperties = @{NSImageCompressionFactor: @(0.8)};
            NSData *jpegData = [imageRep representationUsingType:NSBitmapImageFileTypeJPEG properties:jpegProperties];
            if (jpegData) {
                outputData = [jpegData mutableCopy];
            }
            CGImageRelease(thumbnailRef);
        } else {
            errorMessage = "Failed to create thumbnail (QLThumbnailImageCreate returned NULL)";
        }
    }
}


    void OnOK() override {
        Napi::HandleScope scope(Env());
        if (outputData) {
            Callback().Call({Env().Null(), Napi::Buffer<uint8_t>::Copy(Env(), (const uint8_t *)outputData.bytes, outputData.length)});
        } else {
            Callback().Call({Napi::Error::New(Env(), errorMessage).Value()});
        }
    }

private:
    std::string filePath;
    CGSize thumbnailSize;
    NSMutableData *outputData = nil;
    std::string errorMessage = "Failed to generate thumbnail";
};

// Generate thumbnail (exposed to Node.js)
Napi::Value GenerateThumbnailAsync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Validate arguments
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected a file path and a callback").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string filePath = info[0].As<Napi::String>();
    Napi::Function callback = info[1].As<Napi::Function>();
    CGSize thumbnailSize = CGSizeMake(128, 128);

    // Create and queue the worker
    ThumbnailWorker* worker = new ThumbnailWorker(callback, filePath, thumbnailSize);
    worker->Queue();

    return env.Undefined();
}

// Initialize the module
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "generateThumbnail"),
                Napi::Function::New(env, GenerateThumbnailAsync));
    return exports;
}

NODE_API_MODULE(ThumbnailMac, Init)
