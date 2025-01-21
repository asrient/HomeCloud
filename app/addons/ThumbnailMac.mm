#include <napi.h>
#import <QuickLookThumbnailing/QuickLookThumbnailing.h>
#import <Foundation/Foundation.h>

// Async Worker to handle thumbnail generation
class ThumbnailWorker : public Napi::AsyncWorker {
public:
    ThumbnailWorker(const Napi::Function& callback, std::string filePath, CGSize thumbnailSize)
        : Napi::AsyncWorker(callback), filePath(filePath), thumbnailSize(thumbnailSize) {}

    void Execute() override {
        @autoreleasepool {
            // Convert file path to NSString
            NSString *filePathNSString = [NSString stringWithUTF8String:filePath.c_str()];
            NSURL *fileURL = [NSURL fileURLWithPath:filePathNSString];

            // Create thumbnail generator and request
            QLThumbnailGenerator *generator = [QLThumbnailGenerator sharedGenerator];
            QLThumbnailGenerationRequest *request = [[QLThumbnailGenerationRequest alloc] initWithFileAtURL:fileURL
                                                                                                       size:thumbnailSize
                                                                                                      scale:1.0
                                                                                          representationTypes:QLThumbnailGenerationRequestRepresentationTypeThumbnail];

            // Semaphore to wait for asynchronous generation
            dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

            // Generate thumbnail
            [generator generateBestRepresentationForRequest:request completion:^(QLThumbnailRepresentation * _Nullable thumbnail, NSError * _Nullable error) {
                if (thumbnail) {
                    CGImageRef imageRef = thumbnail.CGImage;
                    if (imageRef) {
                        // Convert CGImage to JPEG data
                        NSBitmapImageRep *imageRep = [[NSBitmapImageRep alloc] initWithCGImage:imageRef];
                        NSDictionary *jpegProperties = @{NSImageCompressionFactor: @(0.8)};
                        NSData *jpegData = [imageRep representationUsingType:NSBitmapImageFileTypeJPEG properties:jpegProperties];
                        if (jpegData) {
                            outputData = [jpegData mutableCopy];
                        }
                    }
                }

                if (error) {
                    errorMessage = error.localizedDescription.UTF8String;
                }

                dispatch_semaphore_signal(semaphore);
            }];

            // Wait for completion
            dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);

            // Cleanup
            [request release];
        }
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        if (outputData) {
            Callback().Call({Env().Null(), Napi::Buffer<uint8_t>::Copy(Env(), outputData.bytes, outputData.length)});
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
