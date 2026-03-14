/**
 * AppsMac.mm
 *
 * Node N-API native addon for macOS remote-desktop functionality.
 *
 * Provides:
 *   - getInstalledApps()        → list installed GUI apps from /Applications
 *   - getRunningApps()          → list running GUI apps (NSWorkspace)
 *   - launchApp(bundleId)       → open app via NSWorkspace
 *   - quitApp(bundleId)         → terminate app
 *   - getWindows(bundleId?)     → visible windows (CGWindowList)
 *   - captureWindow(windowId, tileSize, quality, cb)
 *                               → tile-based JPEG capture of a window
 *   - performAction(payload)    → mouse / keyboard / window actions
 *   - hasScreenRecordingPermission()
 *   - hasAccessibilityPermission()
 *   - requestScreenRecordingPermission()
 *   - requestAccessibilityPermission()
 *
 * Build requirements (binding.gyp frameworks):
 *   CoreGraphics, AppKit, Foundation, ScreenCaptureKit,
 *   CoreImage, ApplicationServices, Carbon
 */

#include <napi.h>
#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#import <CoreImage/CoreImage.h>
#import <VideoToolbox/VideoToolbox.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#include <unordered_map>

#include <vector>
#include <string>
#include <mutex>
#include <cstring>
#include <dispatch/dispatch.h>
#if __has_include(<ScreenCaptureKit/ScreenCaptureKit.h>)
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#define HAS_SCREENCAPTUREKIT 1
#else
#define HAS_SCREENCAPTUREKIT 0
#endif
// Private AX API: map AXUIElementRef → CGWindowID
extern "C" AXError _AXUIElementGetWindow(AXUIElementRef element, uint32_t *windowID);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

static std::string nsStringToStd(NSString *s) {
    return s ? std::string([s UTF8String]) : "";
}

// Resolve the .icns icon path from a bundle, or nil if not found.
static NSString *iconPathForBundle(NSBundle *bundle) {
    if (!bundle) return nil;
    NSString *iconFile = [[bundle infoDictionary] objectForKey:@"CFBundleIconFile"];
    if (!iconFile) return nil;
    if (![iconFile hasSuffix:@".icns"]) iconFile = [iconFile stringByAppendingString:@".icns"];
    NSString *path = [[bundle resourcePath] stringByAppendingPathComponent:iconFile];
    if (![[NSFileManager defaultManager] fileExistsAtPath:path]) return nil;
    return path;
}

// Map a modifier name to a CGEventFlags bit. Returns 0 if not recognized.
static CGEventFlags modifierNameToFlag(const std::string &mod) {
    if (mod == "shift") return kCGEventFlagMaskShift;
    if (mod == "cmd" || mod == "command" || mod == "meta") return kCGEventFlagMaskCommand;
    if (mod == "alt" || mod == "option") return kCGEventFlagMaskAlternate;
    if (mod == "ctrl" || mod == "control") return kCGEventFlagMaskControl;
    return (CGEventFlags)0;
}

// Test whether a CGWindowList dictionary describes a normal (layer-0) window.
static bool isNormalCGWindow(NSDictionary *w, int minSize = 50) {
    int layer = [w[(__bridge NSString *)kCGWindowLayer] intValue];
    float alpha = [w[(__bridge NSString *)kCGWindowAlpha] floatValue];
    NSDictionary *bounds = w[(__bridge NSString *)kCGWindowBounds];
    double width = [bounds[@"Width"] doubleValue];
    double height = [bounds[@"Height"] doubleValue];
    return layer == 0 && alpha >= 0.01 && width >= minSize && height >= minSize;
}



// ──────────────────────────────────────────────
// H.264 streaming via SCStream + VideoToolbox
// ──────────────────────────────────────────────
#if HAS_SCREENCAPTUREKIT

// Thread-safe N-API callback helper: calls a JS function from any thread.
// Uses napi_threadsafe_function to marshal calls to the main JS thread.
struct H264StreamContext {
    uint32_t windowId;
    int width = 0;
    int height = 0;
    int dpi = 1;

    // SCStream (stored as id to avoid availability warnings)
    id stream = nil; // SCStream *
    id streamHandler = nil; // WindowH264StreamHandler
    dispatch_queue_t frameQueue = nil;

    // SCStream configured dimensions (may differ from encoder width/height during resize)
    int configuredWidth = 0;
    int configuredHeight = 0;
    double lastBoundsCheckTime = 0; // CACurrentMediaTime() seconds
    bool pendingReconfig = false;

    // VideoToolbox encoder
    VTCompressionSessionRef vtSession = NULL;
    bool isFirstFrame = true;
    int targetFps = 30;
    int targetBitrate = 15000000; // 15 Mbps default

    // N-API callback
    Napi::ThreadSafeFunction tsfn;
    bool stopped = false;
    std::mutex encodeMutex;   // guards VT encode calls + session lifecycle
    std::atomic<bool> callbackStopped{false}; // lock-free flag for VT callback
};

static std::mutex g_h264Mutex;
static std::unordered_map<uint32_t, std::shared_ptr<H264StreamContext>> g_h264Streams;

// Forward declaration — defined later in the file
static CGRect getWindowBounds(uint32_t windowId);

// VTCompressionSession output callback — called when an encoded frame is ready
static void vtCompressionCallback(void *outputCallbackRefCon,
                                   void *sourceFrameRefCon,
                                   OSStatus status,
                                   VTEncodeInfoFlags infoFlags,
                                   CMSampleBufferRef sampleBuffer) {
    if (status != noErr || !sampleBuffer) return;

    auto *ctx = (H264StreamContext *)outputCallbackRefCon;
    // Use atomic flag — NOT the encodeMutex — to avoid deadlock with EncodeFrame
    if (ctx->callbackStopped.load()) return;

    // Check if keyframe
    CFArrayRef attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, false);
    bool isKeyframe = false;
    if (attachments && CFArrayGetCount(attachments) > 0) {
        CFDictionaryRef dict = (CFDictionaryRef)CFArrayGetValueAtIndex(attachments, 0);
        CFBooleanRef notSync = (CFBooleanRef)CFDictionaryGetValue(dict, kCMSampleAttachmentKey_NotSync);
        isKeyframe = !notSync || !CFBooleanGetValue(notSync);
    }

    // Extract NAL units from the CMSampleBuffer
    CMBlockBufferRef blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer);
    if (!blockBuffer) return;

    size_t totalLen = 0;
    char *dataPtr = NULL;
    OSStatus blockStatus = CMBlockBufferGetDataPointer(blockBuffer, 0, NULL, &totalLen, &dataPtr);
    if (blockStatus != noErr || !dataPtr || totalLen == 0) return;

    // For keyframes, prepend SPS and PPS from the format description
    std::vector<uint8_t> nalData;

    if (isKeyframe) {
        CMFormatDescriptionRef formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer);
        if (formatDesc) {
            // SPS
            size_t spsSize = 0;
            const uint8_t *spsPtr = NULL;
            size_t spsCount = 0;
            CMVideoFormatDescriptionGetH264ParameterSetAtIndex(formatDesc, 0, &spsPtr, &spsSize, &spsCount, NULL);
            if (spsPtr && spsSize > 0) {
                // Annex B start code
                nalData.push_back(0); nalData.push_back(0); nalData.push_back(0); nalData.push_back(1);
                nalData.insert(nalData.end(), spsPtr, spsPtr + spsSize);
            }
            // PPS
            size_t ppsSize = 0;
            const uint8_t *ppsPtr = NULL;
            CMVideoFormatDescriptionGetH264ParameterSetAtIndex(formatDesc, 1, &ppsPtr, &ppsSize, NULL, NULL);
            if (ppsPtr && ppsSize > 0) {
                nalData.push_back(0); nalData.push_back(0); nalData.push_back(0); nalData.push_back(1);
                nalData.insert(nalData.end(), ppsPtr, ppsPtr + ppsSize);
            }
        }
    }

    // Convert AVCC (length-prefixed) NAL units to Annex B (start-code-prefixed)
    size_t offset = 0;
    while (offset < totalLen) {
        uint32_t naluLen = 0;
        memcpy(&naluLen, dataPtr + offset, 4);
        naluLen = CFSwapInt32BigToHost(naluLen);
        offset += 4;
        if (naluLen > 0 && offset + naluLen <= totalLen) {
            nalData.push_back(0); nalData.push_back(0); nalData.push_back(0); nalData.push_back(1);
            nalData.insert(nalData.end(), (uint8_t *)dataPtr + offset, (uint8_t *)dataPtr + offset + naluLen);
        }
        offset += naluLen;
    }

    if (nalData.empty()) return;

    // Capture values for the callback
    int w = ctx->width;
    int h = ctx->height;
    int dpi = ctx->dpi;
    bool kf = isKeyframe;
    bool firstFrame = ctx->isFirstFrame;
    ctx->isFirstFrame = false;

    // Call JS callback via ThreadSafeFunction
    auto naluCopy = std::make_shared<std::vector<uint8_t>>(std::move(nalData));
    ctx->tsfn.NonBlockingCall([naluCopy, w, h, dpi, kf, firstFrame](Napi::Env env, Napi::Function cb) {
        Napi::Object info = Napi::Object::New(env);
        info.Set("data", Napi::Buffer<uint8_t>::Copy(env, naluCopy->data(), naluCopy->size()));
        info.Set("isKeyframe", kf);
        info.Set("width", w);
        info.Set("height", h);
        info.Set("dpi", dpi);
        info.Set("isFirst", firstFrame);
        info.Set("timestamp", (double)[[NSDate date] timeIntervalSince1970] * 1000.0);
        cb.Call({env.Null(), info});
    });
}

API_AVAILABLE(macos(12.3))
@interface WindowH264StreamHandler : NSObject <SCStreamOutput, SCStreamDelegate>
@end

@implementation WindowH264StreamHandler {
    std::weak_ptr<H264StreamContext> _ctxWeak;
    dispatch_queue_t _frameQueue;
}

- (instancetype)initWithContext:(std::shared_ptr<H264StreamContext>)ctx {
    self = [super init];
    if (self) {
        _ctxWeak = ctx;
        _frameQueue = dispatch_queue_create("com.homecloud.h264stream", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

- (dispatch_queue_t)frameQueue {
    return _frameQueue;
}

// SCStreamDelegate — called when the stream stops (window closed, permission revoked, etc.)
- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
    auto ctx = _ctxWeak.lock();
    if (!ctx || ctx->callbackStopped.load()) return;
    ctx->callbackStopped.store(true);
    // Signal JS that the stream ended
    ctx->tsfn.NonBlockingCall([](Napi::Env env, Napi::Function cb) {
        cb.Call({Napi::String::New(env, "Stream ended: window closed or capture stopped"), env.Null()});
    });
}

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type {
    if (type != SCStreamOutputTypeScreen) return;
    auto ctx = _ctxWeak.lock();
    if (!ctx || ctx->stopped) return;

    // Check for window resize every ~500ms and reconfigure SCStream if needed
    if (@available(macOS 12.3, *)) {
        double now = CACurrentMediaTime();
        double elapsed = now - ctx->lastBoundsCheckTime;

        if (elapsed >= 0.5 && !ctx->pendingReconfig) {
            ctx->lastBoundsCheckTime = now;
            CGRect bounds = getWindowBounds(ctx->windowId);
            int newW = (int)(bounds.size.width * ctx->dpi);
            int newH = (int)(bounds.size.height * ctx->dpi);
            if (newW > 0 && newH > 0 && (newW != ctx->configuredWidth || newH != ctx->configuredHeight)) {
                ctx->pendingReconfig = true;
                SCStreamConfiguration *newConfig = [[SCStreamConfiguration alloc] init];
                newConfig.width = (size_t)newW;
                newConfig.height = (size_t)newH;
                newConfig.scalesToFit = YES;
                newConfig.showsCursor = NO;
                newConfig.pixelFormat = kCVPixelFormatType_32BGRA;
                newConfig.minimumFrameInterval = CMTimeMake(1, ctx->targetFps);
                auto ctxWeak = std::weak_ptr<H264StreamContext>(ctx);
                [(SCStream *)ctx->stream updateConfiguration:newConfig completionHandler:^(NSError *err) {
                    auto c = ctxWeak.lock();
                    if (!c) return;
                    c->pendingReconfig = false;
                    if (!err) {
                        c->configuredWidth = newW;
                        c->configuredHeight = newH;
                    }
                }];
            }
        }
    }

    CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
    if (!imageBuffer) return;

    int w = (int)CVPixelBufferGetWidth(imageBuffer);
    int h = (int)CVPixelBufferGetHeight(imageBuffer);

    std::lock_guard<std::mutex> lock(ctx->encodeMutex);
    if (w != ctx->width || h != ctx->height) {
        // Recreate encoder for new dimensions
        if (ctx->vtSession) {
            VTCompressionSessionCompleteFrames(ctx->vtSession, kCMTimeInvalid);
            VTCompressionSessionInvalidate(ctx->vtSession);
            CFRelease(ctx->vtSession);
            ctx->vtSession = NULL;
        }
        ctx->width = w;
        ctx->height = h;
        ctx->isFirstFrame = true;

        // Create new VT session
        OSStatus status = VTCompressionSessionCreate(NULL, w, h,
            kCMVideoCodecType_H264, NULL, NULL, NULL,
            vtCompressionCallback, ctx.get(), &ctx->vtSession);
        if (status != noErr || !ctx->vtSession) return;

        VTSessionSetProperty(ctx->vtSession, kVTCompressionPropertyKey_RealTime, kCFBooleanTrue);
        VTSessionSetProperty(ctx->vtSession, kVTCompressionPropertyKey_ProfileLevel,
            kVTProfileLevel_H264_Main_AutoLevel);
        VTSessionSetProperty(ctx->vtSession, kVTCompressionPropertyKey_AllowFrameReordering,
            kCFBooleanFalse);
        // Zero-frame delay — output each frame immediately, don't buffer for lookahead
        int maxDelay = 0;
        CFNumberRef delayRef = CFNumberCreate(NULL, kCFNumberIntType, &maxDelay);
        VTSessionSetProperty(ctx->vtSession, kVTCompressionPropertyKey_MaxFrameDelayCount, delayRef);
        CFRelease(delayRef);

        int bitrate = ctx->targetBitrate;
        CFNumberRef bitrateRef = CFNumberCreate(NULL, kCFNumberIntType, &bitrate);
        VTSessionSetProperty(ctx->vtSession, kVTCompressionPropertyKey_AverageBitRate, bitrateRef);
        CFRelease(bitrateRef);

        int fps = ctx->targetFps;
        CFNumberRef fpsRef = CFNumberCreate(NULL, kCFNumberIntType, &fps);
        VTSessionSetProperty(ctx->vtSession, kVTCompressionPropertyKey_ExpectedFrameRate, fpsRef);
        CFRelease(fpsRef);

        // Keyframe every 10 seconds
        int keyInterval = fps * 10;
        CFNumberRef keyRef = CFNumberCreate(NULL, kCFNumberIntType, &keyInterval);
        VTSessionSetProperty(ctx->vtSession, kVTCompressionPropertyKey_MaxKeyFrameInterval, keyRef);
        CFRelease(keyRef);

        VTCompressionSessionPrepareToEncodeFrames(ctx->vtSession);
    }

    if (!ctx->vtSession) return;

    // Encode the frame
    CMTime pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
    CMTime dur = CMSampleBufferGetDuration(sampleBuffer);

    // Force keyframe on first frame
    NSDictionary *frameProps = nil;
    if (ctx->isFirstFrame) {
        frameProps = @{
            (__bridge NSString *)kVTEncodeFrameOptionKey_ForceKeyFrame: @YES
        };
    }

    VTCompressionSessionEncodeFrame(ctx->vtSession, imageBuffer, pts,
        dur, (__bridge CFDictionaryRef)frameProps, NULL, NULL);
}

@end

static void stopH264Stream(uint32_t windowId) API_AVAILABLE(macos(12.3)) {
    std::shared_ptr<H264StreamContext> ctx;
    {
        std::lock_guard<std::mutex> lock(g_h264Mutex);
        auto it = g_h264Streams.find(windowId);
        if (it == g_h264Streams.end()) return;
        ctx = it->second;
        g_h264Streams.erase(it);
    }

    {
        std::lock_guard<std::mutex> lock(ctx->encodeMutex);
        ctx->stopped = true;
        ctx->callbackStopped.store(true);
    }

    if (ctx->stream) {
        SCStream *scStream = (SCStream *)ctx->stream;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        [scStream stopCaptureWithCompletionHandler:^(NSError *) {
            dispatch_semaphore_signal(sem);
        }];
        // Wait up to 2s for capture to actually stop
        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC));
        ctx->stream = nil;
        ctx->streamHandler = nil;
    }
    if (ctx->vtSession) {
        VTCompressionSessionCompleteFrames(ctx->vtSession, kCMTimeInvalid);
        VTCompressionSessionInvalidate(ctx->vtSession);
        CFRelease(ctx->vtSession);
        ctx->vtSession = NULL;
    }
    ctx->tsfn.Release();
}

#endif // HAS_SCREENCAPTUREKIT

// ──────────────────────────────────────────────
// 1. Installed apps
// ──────────────────────────────────────────────
static Napi::Value GetInstalledApps(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    @autoreleasepool {
        NSFileManager *fm = [NSFileManager defaultManager];
        NSArray<NSString *> *searchPaths = @[@"/Applications", @"/System/Applications"];
        NSMutableArray<NSDictionary *> *results = [NSMutableArray array];
        NSMutableSet<NSString *> *seen = [NSMutableSet set];

        for (NSString *dir in searchPaths) {
            NSArray<NSString *> *contents = [fm contentsOfDirectoryAtPath:dir error:nil];
            for (NSString *item in contents) {
                if (![item hasSuffix:@".app"]) continue;
                NSString *fullPath = [dir stringByAppendingPathComponent:item];
                NSBundle *bundle = [NSBundle bundleWithPath:fullPath];
                if (!bundle) continue;
                NSString *bundleId = [bundle bundleIdentifier];
                if (!bundleId || [seen containsObject:bundleId]) continue;
                [seen addObject:bundleId];

                NSString *name = [[bundle infoDictionary] objectForKey:@"CFBundleDisplayName"];
                if (!name) name = [[bundle infoDictionary] objectForKey:@"CFBundleName"];
                if (!name) name = [[item lastPathComponent] stringByDeletingPathExtension];

                NSString *iconPath = iconPathForBundle(bundle);
                if (!iconPath) iconPath = nil;

                [results addObject:@{
                    @"name": name ?: @"",
                    @"id": bundleId,
                    @"iconPath": iconPath ?: [NSNull null],
                    @"location": fullPath
                }];
            }
        }

        Napi::Array arr = Napi::Array::New(env, results.count);
        for (NSUInteger i = 0; i < results.count; i++) {
            NSDictionary *d = results[i];
            Napi::Object obj = Napi::Object::New(env);
            obj.Set("name", nsStringToStd(d[@"name"]));
            obj.Set("id", nsStringToStd(d[@"id"]));
            if (d[@"iconPath"] == [NSNull null]) {
                obj.Set("iconPath", env.Null());
            } else {
                obj.Set("iconPath", nsStringToStd(d[@"iconPath"]));
            }
            obj.Set("location", nsStringToStd(d[@"location"]));
            arr.Set(i, obj);
        }
        return arr;
    }
}

// ──────────────────────────────────────────────
// 2. Running apps
// ──────────────────────────────────────────────
static Napi::Value GetRunningApps(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    @autoreleasepool {
        NSArray<NSRunningApplication *> *apps = [[NSWorkspace sharedWorkspace] runningApplications];
        Napi::Array arr = Napi::Array::New(env);
        uint32_t idx = 0;
        for (NSRunningApplication *app in apps) {
            // Only regular (GUI) apps
            if (app.activationPolicy != NSApplicationActivationPolicyRegular) continue;
            Napi::Object obj = Napi::Object::New(env);
            obj.Set("name", nsStringToStd(app.localizedName));
            obj.Set("id", nsStringToStd(app.bundleIdentifier));
            NSString *iconPath = nil;
            if (app.bundleURL) {
                iconPath = iconPathForBundle([NSBundle bundleWithURL:app.bundleURL]);
            }
            if (iconPath) {
                obj.Set("iconPath", nsStringToStd(iconPath));
            } else {
                obj.Set("iconPath", env.Null());
            }
            arr.Set(idx++, obj);
        }
        return arr;
    }
}

// ──────────────────────────────────────────────
// 4. Launch app
// ──────────────────────────────────────────────
static Napi::Value LaunchApp(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected bundleId string").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string bundleId = info[0].As<Napi::String>().Utf8Value();

    @autoreleasepool {
        NSString *bid = [NSString stringWithUTF8String:bundleId.c_str()];
        NSWorkspace *ws = [NSWorkspace sharedWorkspace];
        NSURL *appURL = [ws URLForApplicationWithBundleIdentifier:bid];
        if (!appURL) {
            Napi::Error::New(env, "Application not found: " + bundleId).ThrowAsJavaScriptException();
            return env.Null();
        }
        if (@available(macOS 10.15, *)) {
            NSWorkspaceOpenConfiguration *config = [NSWorkspaceOpenConfiguration configuration];
            config.activates = YES;
            [ws openApplicationAtURL:appURL configuration:config completionHandler:nil];
        } else {
            [[NSWorkspace sharedWorkspace] launchApplication:[appURL path]];
        }
    }
    return env.Undefined();
}

// ──────────────────────────────────────────────
// 5. Quit app
// ──────────────────────────────────────────────
static Napi::Value QuitApp(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected bundleId string").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string bundleId = info[0].As<Napi::String>().Utf8Value();

    @autoreleasepool {
        NSArray<NSRunningApplication *> *apps =
            [NSRunningApplication runningApplicationsWithBundleIdentifier:
                [NSString stringWithUTF8String:bundleId.c_str()]];
        for (NSRunningApplication *app in apps) {
            [app terminate];
        }
    }
    return env.Undefined();
}

// ──────────────────────────────────────────────
// 5b. Get app icon as base64 PNG
// ──────────────────────────────────────────────
static Napi::Value GetAppIcon(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected bundleId string").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string bundleId = info[0].As<Napi::String>().Utf8Value();

    @autoreleasepool {
        NSString *bid = [NSString stringWithUTF8String:bundleId.c_str()];
        NSString *appPath = [[NSWorkspace sharedWorkspace] absolutePathForAppBundleWithIdentifier:bid];
        if (!appPath) {
            return env.Null();
        }

        NSImage *icon = [[NSWorkspace sharedWorkspace] iconForFile:appPath];
        if (!icon) {
            return env.Null();
        }

        // Render the icon at 64x64
        NSSize targetSize = NSMakeSize(64, 64);
        [icon setSize:targetSize];

        NSBitmapImageRep *rep = [[NSBitmapImageRep alloc]
            initWithBitmapDataPlanes:NULL
            pixelsWide:(NSInteger)targetSize.width
            pixelsHigh:(NSInteger)targetSize.height
            bitsPerSample:8
            samplesPerPixel:4
            hasAlpha:YES
            isPlanar:NO
            colorSpaceName:NSDeviceRGBColorSpace
            bytesPerRow:0
            bitsPerPixel:0];

        NSGraphicsContext *ctx = [NSGraphicsContext graphicsContextWithBitmapImageRep:rep];
        [NSGraphicsContext saveGraphicsState];
        [NSGraphicsContext setCurrentContext:ctx];
        [icon drawInRect:NSMakeRect(0, 0, targetSize.width, targetSize.height)
               fromRect:NSZeroRect
              operation:NSCompositingOperationSourceOver
               fraction:1.0];
        [NSGraphicsContext restoreGraphicsState];

        NSData *pngData = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        if (!pngData) {
            return env.Null();
        }

        NSString *b64 = [pngData base64EncodedStringWithOptions:0];
        std::string dataUri = "data:image/png;base64," + nsStringToStd(b64);
        return Napi::String::New(env, dataUri);
    }
}

// Forward declaration — defined after section 7.
static AXUIElementRef axWindowForId(uint32_t windowId, CFArrayRef axWindows);

// ──────────────────────────────────────────────
// 6. Get windows
// ──────────────────────────────────────────────
static Napi::Value GetWindows(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();

    pid_t filterPid = -1;
    if (info.Length() >= 1 && info[0].IsString()) {
        std::string bundleId = info[0].As<Napi::String>().Utf8Value();
        @autoreleasepool {
            NSArray<NSRunningApplication *> *apps =
                [NSRunningApplication runningApplicationsWithBundleIdentifier:
                    [NSString stringWithUTF8String:bundleId.c_str()]];
            if (apps.count > 0) {
                filterPid = apps.firstObject.processIdentifier;
            }
        }
    }

    @autoreleasepool {
        CFArrayRef windowList = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
            kCGNullWindowID);

        Napi::Array arr = Napi::Array::New(env);
        uint32_t idx = 0;

        // Cache running-app info by PID for focus/hidden lookups.
        std::unordered_map<pid_t, NSRunningApplication *> runningByPid;
        for (NSRunningApplication *ra in [[NSWorkspace sharedWorkspace] runningApplications]) {
            if (ra.activationPolicy != NSApplicationActivationPolicyRegular) continue;
            runningByPid[ra.processIdentifier] = ra;
        }

        if (windowList) {
            NSArray *wl = (__bridge NSArray *)windowList;

            // First pass: collect normal (layer 0) windows and build a PID→windowId map
            // so popup windows can reference their parent.
            std::unordered_map<pid_t, std::string> pidToParentWindowId;

            // Pre-fetch AX windows per PID for type detection (subrole/modal)
            std::unordered_map<pid_t, CFArrayRef> pidAXWindows;
            auto getAXWindows = [&](pid_t pid) -> CFArrayRef {
                auto it = pidAXWindows.find(pid);
                if (it != pidAXWindows.end()) return it->second;
                AXUIElementRef appRef = AXUIElementCreateApplication(pid);
                CFArrayRef axWins = NULL;
                AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef *)&axWins);
                CFRelease(appRef);
                pidAXWindows[pid] = axWins; // may be NULL
                return axWins;
            };

            // Determine window type from AX subrole for layer-0 windows
            auto detectWindowType = [&](uint32_t windowId, pid_t pid) -> std::string {
                CFArrayRef axWins = getAXWindows(pid);
                if (!axWins) return "regular";
                AXUIElementRef axWin = axWindowForId(windowId, axWins);
                if (!axWin) return "regular";

                // Check if modal first
                CFTypeRef modalVal = NULL;
                if (AXUIElementCopyAttributeValue(axWin, CFSTR("AXModal"), &modalVal) == kAXErrorSuccess) {
                    if (modalVal) {
                        Boolean isModal = CFBooleanGetValue((CFBooleanRef)modalVal);
                        CFRelease(modalVal);
                        if (isModal) return "modal";
                    }
                }

                // Check subrole
                CFStringRef subrole = NULL;
                if (AXUIElementCopyAttributeValue(axWin, kAXSubroleAttribute, (CFTypeRef *)&subrole) == kAXErrorSuccess && subrole) {
                    std::string type = "regular";
                    if (CFStringCompare(subrole, CFSTR("AXDialog"), 0) == kCFCompareEqualTo ||
                        CFStringCompare(subrole, CFSTR("AXSheet"), 0) == kCFCompareEqualTo) {
                        type = "modal";
                    } else if (CFStringCompare(subrole, CFSTR("AXFloatingWindow"), 0) == kCFCompareEqualTo) {
                        type = "floating";
                    }
                    CFRelease(subrole);
                    return type;
                }
                return "regular";
            };

            // Determine window type from CG layer for non-zero layer windows
            auto typeFromLayer = [](int layer) -> std::string {
                if (layer == 3) return "floating";
                if (layer == 8) return "modal";
                if (layer == 25 || (layer >= 24 && layer <= 26)) return "tooltip";
                if (layer == 101) return "contextMenu";
                return "popup";
            };

            for (NSDictionary *w in wl) {
                pid_t wPid = [w[(__bridge NSString *)kCGWindowOwnerPID] intValue];
                if (filterPid != -1 && wPid != filterPid) continue;
                if (!isNormalCGWindow(w)) continue;

                uint32_t windowId = [w[(__bridge NSString *)kCGWindowNumber] unsignedIntValue];
                NSString *title = w[(__bridge NSString *)kCGWindowName];

                bool isFocused = false;
                bool isHidden = false;
                auto appIt = runningByPid.find(wPid);
                if (appIt != runningByPid.end()) {
                    isFocused = appIt->second.isActive;
                    isHidden = appIt->second.isHidden;
                }

                std::string idStr = std::to_string(windowId);
                std::string windowType = detectWindowType(windowId, wPid);

                // Remember the first normal window per PID as the parent for popups
                if (pidToParentWindowId.find(wPid) == pidToParentWindowId.end()) {
                    pidToParentWindowId[wPid] = idStr;
                }

                Napi::Object obj = Napi::Object::New(env);
                obj.Set("id", idStr);
                obj.Set("title", nsStringToStd(title));
                obj.Set("type", windowType);
                obj.Set("isFocused", isFocused);
                obj.Set("isHidden", isHidden);
                obj.Set("isMinimized", false);
                obj.Set("isMaximized", false);
                NSDictionary *wBounds = w[(__bridge NSString *)kCGWindowBounds];
                obj.Set("x", [wBounds[@"X"] doubleValue]);
                obj.Set("y", [wBounds[@"Y"] doubleValue]);
                obj.Set("width", [wBounds[@"Width"] doubleValue]);
                obj.Set("height", [wBounds[@"Height"] doubleValue]);
                arr.Set(idx++, obj);
            }

            // Second pass: collect popup/menu windows (layer > 0) from the same process.
            // On macOS 14.2+, SCStream's includeChildWindows (default true) already captures
            // these in the stream, so skip to avoid duplication.
            if (@available(macOS 14.2, *)) {
                // Child windows included in stream — no separate enumeration needed
            } else {
                for (NSDictionary *w in wl) {
                    pid_t wPid = [w[(__bridge NSString *)kCGWindowOwnerPID] intValue];
                    if (filterPid != -1 && wPid != filterPid) continue;

                    // Only include if we have a parent normal window for this PID
                    auto parentIt = pidToParentWindowId.find(wPid);
                    if (parentIt == pidToParentWindowId.end()) continue;

                    int layer = [w[(__bridge NSString *)kCGWindowLayer] intValue];
                    float alpha = [w[(__bridge NSString *)kCGWindowAlpha] floatValue];
                    NSDictionary *bounds = w[(__bridge NSString *)kCGWindowBounds];
                    double width = [bounds[@"Width"] doubleValue];
                    double height = [bounds[@"Height"] doubleValue];
                    // Popup windows have layer > 0; skip tiny or invisible ones
                    if (layer <= 0 || alpha < 0.01 || width < 2 || height < 2) continue;

                    uint32_t windowId = [w[(__bridge NSString *)kCGWindowNumber] unsignedIntValue];
                    NSString *title = w[(__bridge NSString *)kCGWindowName];

                    Napi::Object obj = Napi::Object::New(env);
                    obj.Set("id", std::to_string(windowId));
                    obj.Set("title", nsStringToStd(title));
                    obj.Set("type", typeFromLayer(layer));
                    obj.Set("isFocused", false);
                    obj.Set("isHidden", false);
                    obj.Set("isMinimized", false);
                    obj.Set("isMaximized", false);
                    obj.Set("x", [bounds[@"X"] doubleValue]);
                    obj.Set("y", [bounds[@"Y"] doubleValue]);
                    obj.Set("width", width);
                    obj.Set("height", height);
                    obj.Set("parentWindowId", parentIt->second);
                    arr.Set(idx++, obj);
                }
            }

            // Clean up AX window arrays
            for (auto &pair : pidAXWindows) {
                if (pair.second) CFRelease(pair.second);
            }

            CFRelease(windowList);
        }
        return arr;
    }
}

// ──────────────────────────────────────────────
// 8. Perform action
// ──────────────────────────────────────────────

// Get the PID that owns a window. Returns -1 if not found.
static pid_t pidForWindow(uint32_t windowId) {
    CFArrayRef windowList = CGWindowListCopyWindowInfo(
        kCGWindowListOptionIncludingWindow, windowId);
    if (!windowList || CFArrayGetCount(windowList) == 0) {
        if (windowList) CFRelease(windowList);
        return -1;
    }
    NSDictionary *wInfo = (__bridge NSDictionary *)CFArrayGetValueAtIndex(windowList, 0);
    pid_t pid = [wInfo[(__bridge NSString *)kCGWindowOwnerPID] intValue];
    CFRelease(windowList);
    return pid;
}

// Find the AXUIElementRef matching a CGWindowID via _AXUIElementGetWindow.
// Returns a non-retained reference from axWindows, or NULL if no match.
static AXUIElementRef axWindowForId(uint32_t windowId, CFArrayRef axWindows) {
    for (CFIndex i = 0; i < CFArrayGetCount(axWindows); i++) {
        AXUIElementRef win = (AXUIElementRef)CFArrayGetValueAtIndex(axWindows, i);
        uint32_t wid = 0;
        if (_AXUIElementGetWindow(win, &wid) == kAXErrorSuccess && wid == windowId) {
            return win;
        }
    }
    return NULL;
}

// Calls block with the specific AX window matching windowId.
// Handles CGWindowList → PID → AX boilerplate, cleanup, and window matching.
// Falls back to first AX window if no exact match found.
// Returns false if window not found or has no AX windows.
static bool withAXWindow(uint32_t windowId, void (^block)(AXUIElementRef axWindow)) {
    @autoreleasepool {
        pid_t pid = pidForWindow(windowId);
        if (pid < 0) return false;
        AXUIElementRef appRef = AXUIElementCreateApplication(pid);
        CFArrayRef axWindows = NULL;
        AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef *)&axWindows);
        bool ok = false;
        if (axWindows && CFArrayGetCount(axWindows) > 0) {
            AXUIElementRef target = axWindowForId(windowId, axWindows);
            if (!target) target = (AXUIElementRef)CFArrayGetValueAtIndex(axWindows, 0);
            block(target);
            ok = true;
        }
        if (axWindows) CFRelease(axWindows);
        CFRelease(appRef);
        return ok;
    }
}

// Helper: ensure the window is ready to receive input.
// Returns false if the window no longer exists.
static bool ensureWindowReady(uint32_t windowId) {
    @autoreleasepool {
        pid_t pid = pidForWindow(windowId);
        if (pid < 0) {
            NSLog(@"[ensureWindowReady] pidForWindow failed for windowId %u", windowId);
            return false;
        }

        NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
        if (!app) {
            NSLog(@"[ensureWindowReady] NSRunningApplication not found for pid %d", pid);
            return false;
        }

        bool needsActivation = false;
        bool wasMinimized = false;

        // Use AX API for everything — NSRunningApplication activation APIs
        // are unreliable from helper/background processes on macOS 14+.
        AXUIElementRef appRef = AXUIElementCreateApplication(pid);

        // 1. Check if app is frontmost, activate via AX if not
        NSRunningApplication *frontmost = [[NSWorkspace sharedWorkspace] frontmostApplication];
        if (!frontmost || frontmost.processIdentifier != pid) {
            // Set app as frontmost via Accessibility API
            AXError frontErr = AXUIElementSetAttributeValue(appRef, kAXFrontmostAttribute, kCFBooleanTrue);
            if (frontErr != kAXErrorSuccess) {
                NSLog(@"[ensureWindowReady] set kAXFrontmostAttribute failed: %d, falling back to NSRunningApplication", (int)frontErr);
                // Fallback: try NSRunningApplication activate
                #pragma clang diagnostic push
                #pragma clang diagnostic ignored "-Wdeprecated-declarations"
                [app activateWithOptions:
                    NSApplicationActivateIgnoringOtherApps | NSApplicationActivateAllWindows];
                #pragma clang diagnostic pop
            }
            needsActivation = true;
        }

        // 2. Find and prepare the target window via AX API
        CFArrayRef axWindows = NULL;
        AXError axErr = AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef *)&axWindows);
        if (axErr != kAXErrorSuccess) {
            NSLog(@"[ensureWindowReady] kAXWindowsAttribute failed: %d", (int)axErr);
        }
        if (axWindows) {
            AXUIElementRef targetWin = axWindowForId(windowId, axWindows);
            if (!targetWin && CFArrayGetCount(axWindows) > 0) {
                targetWin = (AXUIElementRef)CFArrayGetValueAtIndex(axWindows, 0);
            }
            if (targetWin) {
                // Un-minimize if needed
                CFBooleanRef minimized = NULL;
                AXUIElementCopyAttributeValue(targetWin, kAXMinimizedAttribute, (CFTypeRef *)&minimized);
                if (minimized && CFBooleanGetValue(minimized)) {
                    AXUIElementSetAttributeValue(targetWin, kAXMinimizedAttribute, kCFBooleanFalse);
                    wasMinimized = true;
                }
                if (minimized) CFRelease(minimized);
                // Raise, make main, and set as focused window
                AXUIElementPerformAction(targetWin, kAXRaiseAction);
                AXUIElementSetAttributeValue(targetWin, kAXMainAttribute, kCFBooleanTrue);
                AXUIElementSetAttributeValue(appRef, kAXFocusedWindowAttribute, targetWin);
            }
            CFRelease(axWindows);
        }
        CFRelease(appRef);

        // 3. Wait until activation completes (max 500ms)
        if (needsActivation || wasMinimized) {
            for (int i = 0; i < 25; i++) {
                usleep(20000);
                NSRunningApplication *current = [[NSWorkspace sharedWorkspace] frontmostApplication];
                bool ready = (current && current.processIdentifier == pid);
                if (wasMinimized) {
                    AXUIElementRef ar = AXUIElementCreateApplication(pid);
                    CFArrayRef aw = NULL;
                    AXUIElementCopyAttributeValue(ar, kAXWindowsAttribute, (CFTypeRef *)&aw);
                    if (aw) {
                        AXUIElementRef tw = axWindowForId(windowId, aw);
                        if (tw) {
                            CFBooleanRef m = NULL;
                            AXUIElementCopyAttributeValue(tw, kAXMinimizedAttribute, (CFTypeRef *)&m);
                            if (m && CFBooleanGetValue(m)) ready = false;
                            if (m) CFRelease(m);
                        }
                        CFRelease(aw);
                    }
                    CFRelease(ar);
                }
                if (ready) break;
            }
        }
        return true;
    }
}

// Helper: get window bounds
static CGRect getWindowBounds(uint32_t windowId) {
    CGRect rect = CGRectZero;
    @autoreleasepool {
        CFArrayRef windowList = CGWindowListCopyWindowInfo(
            kCGWindowListOptionIncludingWindow, windowId);
        if (windowList && CFArrayGetCount(windowList) > 0) {
            NSDictionary *wInfo = (__bridge NSDictionary *)CFArrayGetValueAtIndex(windowList, 0);
            NSDictionary *bounds = wInfo[(__bridge NSString *)kCGWindowBounds];
            rect.origin.x = [bounds[@"X"] doubleValue];
            rect.origin.y = [bounds[@"Y"] doubleValue];
            rect.size.width = [bounds[@"Width"] doubleValue];
            rect.size.height = [bounds[@"Height"] doubleValue];
        }
        if (windowList) CFRelease(windowList);
    }
    return rect;
}

static CGPoint screenPointFromPayload(uint32_t windowId, const Napi::Object &payload) {
    double x = payload.Has("x") ? payload.Get("x").As<Napi::Number>().DoubleValue() : 0;
    double y = payload.Has("y") ? payload.Get("y").As<Napi::Number>().DoubleValue() : 0;
    CGRect bounds = getWindowBounds(windowId);
    return CGPointMake(bounds.origin.x + x, bounds.origin.y + y);
}

static void postMouseClick(CGPoint point, CGMouseButton button, bool isRightClick, CGEventFlags modifiers = 0) {
    CGEventType downType = isRightClick ? kCGEventRightMouseDown : kCGEventLeftMouseDown;
    CGEventType upType = isRightClick ? kCGEventRightMouseUp : kCGEventLeftMouseUp;

    CGEventRef down = CGEventCreateMouseEvent(NULL, downType, point, button);
    CGEventRef up = CGEventCreateMouseEvent(NULL, upType, point, button);
    if (modifiers) {
        if (down) CGEventSetFlags(down, modifiers);
        if (up) CGEventSetFlags(up, modifiers);
    }
    if (down) { CGEventPost(kCGHIDEventTap, down); CFRelease(down); }
    if (up) { CGEventPost(kCGHIDEventTap, up); CFRelease(up); }
}

static void postMouseDoubleClick(CGPoint point, CGMouseButton button, bool isRightClick, CGEventFlags modifiers = 0) {
    CGEventType downType = isRightClick ? kCGEventRightMouseDown : kCGEventLeftMouseDown;
    CGEventType upType = isRightClick ? kCGEventRightMouseUp : kCGEventLeftMouseUp;

    for (int click = 1; click <= 2; click++) {
        CGEventRef down = CGEventCreateMouseEvent(NULL, downType, point, button);
        CGEventRef up = CGEventCreateMouseEvent(NULL, upType, point, button);
        if (down) CGEventSetIntegerValueField(down, kCGMouseEventClickState, click);
        if (up) CGEventSetIntegerValueField(up, kCGMouseEventClickState, click);
        if (modifiers) {
            if (down) CGEventSetFlags(down, modifiers);
            if (up) CGEventSetFlags(up, modifiers);
        }
        if (down) { CGEventPost(kCGHIDEventTap, down); CFRelease(down); }
        if (up) { CGEventPost(kCGHIDEventTap, up); CFRelease(up); }
    }
}

static void postMouseDown(CGPoint point, CGMouseButton button, bool isRightClick, CGEventFlags modifiers = 0) {
    CGEventType downType = isRightClick ? kCGEventRightMouseDown : kCGEventLeftMouseDown;
    CGEventRef down = CGEventCreateMouseEvent(NULL, downType, point, button);
    if (modifiers && down) CGEventSetFlags(down, modifiers);
    if (down) { CGEventPost(kCGHIDEventTap, down); CFRelease(down); }
}

static void postMouseDrag(CGPoint point, bool isRightClick) {
    CGEventType dragType = isRightClick ? kCGEventOtherMouseDragged : kCGEventLeftMouseDragged;
    CGEventRef drag = CGEventCreateMouseEvent(NULL, dragType, point, kCGMouseButtonLeft);
    if (drag) { CGEventPost(kCGHIDEventTap, drag); CFRelease(drag); }
}

static void postMouseUp(CGPoint point, CGMouseButton button, bool isRightClick, CGEventFlags modifiers = 0) {
    CGEventType upType = isRightClick ? kCGEventRightMouseUp : kCGEventLeftMouseUp;
    CGEventRef up = CGEventCreateMouseEvent(NULL, upType, point, button);
    if (modifiers && up) CGEventSetFlags(up, modifiers);
    if (up) { CGEventPost(kCGHIDEventTap, up); CFRelease(up); }
}

static CGEventFlags parseModifiers(const Napi::Object &payload) {
    CGEventFlags flags = (CGEventFlags)0;
    if (payload.Has("modifiers") && payload.Get("modifiers").IsArray()) {
        Napi::Array mods = payload.Get("modifiers").As<Napi::Array>();
        for (uint32_t i = 0; i < mods.Length(); i++) {
            flags |= modifierNameToFlag(mods.Get(i).As<Napi::String>().Utf8Value());
        }
    }
    return flags;
}

static void postMouseMove(CGPoint point) {
    CGEventRef move = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, point, kCGMouseButtonLeft);
    if (move) { CGEventPost(kCGHIDEventTap, move); CFRelease(move); }
}

static void postScroll(int32_t deltaX, int32_t deltaY) {
    CGEventRef scroll = CGEventCreateScrollWheelEvent(NULL, kCGScrollEventUnitPixel, 2, deltaY, deltaX);
    if (scroll) { CGEventPost(kCGHIDEventTap, scroll); CFRelease(scroll); }
}

static void postKeyInput(const std::string &key) {
    // Map common key names to virtual keycodes
    // Reference: Events.h / Carbon HIToolbox
    static const std::unordered_map<std::string, CGKeyCode> keyMap = {
        {"return", 36}, {"enter", 36}, {"tab", 48}, {"space", 49},
        {"delete", 51}, {"backspace", 51}, {"escape", 53}, {"esc", 53},
        {"command", 55}, {"cmd", 55}, {"shift", 56}, {"capslock", 57},
        {"option", 58}, {"alt", 58}, {"control", 59}, {"ctrl", 59},
        {"rightshift", 60}, {"rightoption", 61}, {"rightcontrol", 62},
        {"function", 63}, {"fn", 63},
        {"f1", 122}, {"f2", 120}, {"f3", 99}, {"f4", 118},
        {"f5", 96}, {"f6", 97}, {"f7", 98}, {"f8", 100},
        {"f9", 101}, {"f10", 109}, {"f11", 103}, {"f12", 111},
        {"home", 115}, {"end", 119}, {"pageup", 116}, {"pagedown", 121},
        {"left", 123}, {"right", 124}, {"down", 125}, {"up", 126},
        {"arrowleft", 123}, {"arrowright", 124}, {"arrowdown", 125}, {"arrowup", 126},
    };

    // Check for modifier+key combos like "cmd+c"
    // Split by + and process
    std::vector<std::string> parts;
    std::string current;
    std::string lowerKey = key;
    std::transform(lowerKey.begin(), lowerKey.end(), lowerKey.begin(), ::tolower);

    for (char c : lowerKey) {
        if (c == '+') {
            if (!current.empty()) { parts.push_back(current); current.clear(); }
        } else {
            current += c;
        }
    }
    if (!current.empty()) parts.push_back(current);

    if (parts.empty()) return;

    // Determine modifier flags and final key
    CGEventFlags modifiers = (CGEventFlags)0;
    std::string mainKey = parts.back();

    for (size_t i = 0; i < parts.size() - 1; i++) {
        modifiers |= modifierNameToFlag(parts[i]);
    }

    CGKeyCode keyCode = 0;
    auto it = keyMap.find(mainKey);
    if (it != keyMap.end()) {
        keyCode = it->second;
    } else if (mainKey.length() == 1) {
        // For single characters, use virtual key 0 and set unicode
        char ch = mainKey[0];
        // Map a-z to keycodes
        if (ch >= 'a' && ch <= 'z') {
            static const CGKeyCode alphaKeys[] = {
                0, 11, 8, 2, 14, 3, 5, 4, 34, 38, 40, 37, 46,
                45, 31, 35, 12, 15, 1, 17, 32, 9, 13, 7, 16, 6
            };
            keyCode = alphaKeys[ch - 'a'];
        } else if (ch >= '0' && ch <= '9') {
            static const CGKeyCode numKeys[] = {29, 18, 19, 20, 21, 23, 22, 26, 28, 25};
            keyCode = numKeys[ch - '0'];
        }
    }

    CGEventRef down = CGEventCreateKeyboardEvent(NULL, keyCode, true);
    CGEventRef up = CGEventCreateKeyboardEvent(NULL, keyCode, false);
    if (modifiers) {
        if (down) CGEventSetFlags(down, modifiers);
        if (up) CGEventSetFlags(up, modifiers);
    }
    if (down) { CGEventPost(kCGHIDEventTap, down); CFRelease(down); }
    if (up) { CGEventPost(kCGHIDEventTap, up); CFRelease(up); }
}

static void postTextInput(const std::string &text) {
    @autoreleasepool {
        NSString *nsText = [NSString stringWithUTF8String:text.c_str()];
        for (NSUInteger i = 0; i < nsText.length; i++) {
            unichar ch = [nsText characterAtIndex:i];
            CGEventRef down = CGEventCreateKeyboardEvent(NULL, 0, true);
            CGEventRef up = CGEventCreateKeyboardEvent(NULL, 0, false);
            UniChar uniChar = (UniChar)ch;
            if (down) CGEventKeyboardSetUnicodeString(down, 1, &uniChar);
            if (up) CGEventKeyboardSetUnicodeString(up, 1, &uniChar);
            if (down) { CGEventPost(kCGHIDEventTap, down); CFRelease(down); }
            if (up) { CGEventPost(kCGHIDEventTap, up); CFRelease(up); }
            usleep(1000); // 1ms pacing between chars
        }
    }
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
    uint32_t windowId = (uint32_t)std::stoul(windowIdStr);

    if (action == "focus") {
        ensureWindowReady(windowId);
    }
    else if (action == "minimize") {
        withAXWindow(windowId, ^(AXUIElementRef win) {
            AXUIElementSetAttributeValue(win, kAXMinimizedAttribute, kCFBooleanTrue);
        });
    }
    else if (action == "maximize") {
        withAXWindow(windowId, ^(AXUIElementRef win) {
            NSScreen *mainScreen = [NSScreen mainScreen];
            NSRect screenFrame = mainScreen.visibleFrame;
            CGPoint origin = CGPointMake(screenFrame.origin.x, screenFrame.origin.y);
            CGSize size = CGSizeMake(screenFrame.size.width, screenFrame.size.height);
            AXValueRef posVal = AXValueCreate((AXValueType)kAXValueCGPointType, &origin);
            AXValueRef sizeVal = AXValueCreate((AXValueType)kAXValueCGSizeType, &size);
            AXUIElementSetAttributeValue(win, kAXPositionAttribute, posVal);
            AXUIElementSetAttributeValue(win, kAXSizeAttribute, sizeVal);
            CFRelease(posVal);
            CFRelease(sizeVal);
        });
    }
    else if (action == "restore") {
        withAXWindow(windowId, ^(AXUIElementRef win) {
            AXUIElementSetAttributeValue(win, kAXMinimizedAttribute, kCFBooleanFalse);
        });
    }
    else if (action == "close") {
        withAXWindow(windowId, ^(AXUIElementRef win) {
            AXUIElementRef closeButton = NULL;
            AXUIElementCopyAttributeValue(win, kAXCloseButtonAttribute, (CFTypeRef *)&closeButton);
            if (closeButton) {
                AXUIElementPerformAction(closeButton, kAXPressAction);
                CFRelease(closeButton);
            }
        });
    }
    else if (action == "click" || action == "rightClick") {
        if (!ensureWindowReady(windowId)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        CGPoint screenPoint = screenPointFromPayload(windowId, payload);
        CGEventFlags modifiers = parseModifiers(payload);
        CGWarpMouseCursorPosition(screenPoint);
        CGAssociateMouseAndMouseCursorPosition(true);
        bool isRight = (action == "rightClick");
        postMouseClick(screenPoint, isRight ? kCGMouseButtonRight : kCGMouseButtonLeft, isRight, modifiers);
    }
    else if (action == "doubleClick") {
        if (!ensureWindowReady(windowId)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        CGPoint screenPoint = screenPointFromPayload(windowId, payload);
        CGEventFlags modifiers = parseModifiers(payload);
        CGWarpMouseCursorPosition(screenPoint);
        CGAssociateMouseAndMouseCursorPosition(true);
        postMouseDoubleClick(screenPoint, kCGMouseButtonLeft, false, modifiers);
    }
    else if (action == "dragStart") {
        if (!ensureWindowReady(windowId)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        CGPoint screenPoint = screenPointFromPayload(windowId, payload);
        CGEventFlags modifiers = parseModifiers(payload);
        CGWarpMouseCursorPosition(screenPoint);
        CGAssociateMouseAndMouseCursorPosition(true);
        postMouseDown(screenPoint, kCGMouseButtonLeft, false, modifiers);
    }
    else if (action == "dragMove") {
        CGPoint screenPoint = screenPointFromPayload(windowId, payload);
        CGWarpMouseCursorPosition(screenPoint);
        postMouseDrag(screenPoint, false);
    }
    else if (action == "dragEnd") {
        CGPoint screenPoint = screenPointFromPayload(windowId, payload);
        CGEventFlags modifiers = parseModifiers(payload);
        postMouseUp(screenPoint, kCGMouseButtonLeft, false, modifiers);
    }
    else if (action == "hover") {
        if (!ensureWindowReady(windowId)) return env.Undefined();
        CGPoint screenPoint = screenPointFromPayload(windowId, payload);
        CGWarpMouseCursorPosition(screenPoint);
        postMouseMove(screenPoint);
    }
    else if (action == "textInput") {
        if (!ensureWindowReady(windowId)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string text = payload.Has("text") ? payload.Get("text").As<Napi::String>().Utf8Value() : "";
        postTextInput(text);
    }
    else if (action == "keyInput") {
        if (!ensureWindowReady(windowId)) {
            Napi::Error::New(env, "Window no longer exists").ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string key = payload.Has("key") ? payload.Get("key").As<Napi::String>().Utf8Value() : "";
        postKeyInput(key);
    }
    else if (action == "scroll") {
        if (!ensureWindowReady(windowId)) return env.Undefined();
        CGPoint screenPoint = screenPointFromPayload(windowId, payload);
        int32_t deltaX = payload.Has("scrollDeltaX") ? payload.Get("scrollDeltaX").As<Napi::Number>().Int32Value() : 0;
        int32_t deltaY = payload.Has("scrollDeltaY") ? payload.Get("scrollDeltaY").As<Napi::Number>().Int32Value() : 0;
        CGWarpMouseCursorPosition(screenPoint);
        postScroll(deltaX, deltaY);
    }
    else if (action == "resize") {
        double newWidth = payload.Has("newWidth") ? payload.Get("newWidth").As<Napi::Number>().DoubleValue() : 0;
        double newHeight = payload.Has("newHeight") ? payload.Get("newHeight").As<Napi::Number>().DoubleValue() : 0;
        if (newWidth <= 0 || newHeight <= 0) {
            Napi::Error::New(env, "resize requires positive newWidth and newHeight").ThrowAsJavaScriptException();
            return env.Null();
        }
        withAXWindow(windowId, ^(AXUIElementRef win) {
            CGSize size = CGSizeMake(newWidth, newHeight);
            AXValueRef sizeVal = AXValueCreate((AXValueType)kAXValueCGSizeType, &size);
            AXUIElementSetAttributeValue(win, kAXSizeAttribute, sizeVal);
            CFRelease(sizeVal);
        });
    }
    else {
        Napi::Error::New(env, "Unknown action: " + action).ThrowAsJavaScriptException();
        return env.Null();
    }

    return env.Undefined();
}

// ──────────────────────────────────────────────
// 9. Permissions
// ──────────────────────────────────────────────

static Napi::Value HasScreenRecordingPermission(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    @autoreleasepool {
        // Check if we can read window names from CGWindowList.
        // Without screen recording permission, kCGWindowName is nil for other apps.
        CFArrayRef windowList = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
            kCGNullWindowID);
        if (!windowList) return Napi::Boolean::New(env, false);
        NSArray *wl = (__bridge NSArray *)windowList;
        bool hasPermission = false;
        for (NSDictionary *w in wl) {
            // Skip our own process — we can always read our own window names
            pid_t wPid = [w[(__bridge NSString *)kCGWindowOwnerPID] intValue];
            if (wPid == [[NSProcessInfo processInfo] processIdentifier]) continue;
            // If we can read any other app's window name, permission is granted
            if (w[(__bridge NSString *)kCGWindowName] != nil) {
                hasPermission = true;
                break;
            }
        }
        CFRelease(windowList);
        return Napi::Boolean::New(env, hasPermission);
    }
}

static Napi::Value HasAccessibilityPermission(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    bool trusted = AXIsProcessTrusted();
    return Napi::Boolean::New(env, trusted);
}

static Napi::Value RequestScreenRecordingPermission(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    @autoreleasepool {
        // Attempt a capture to trigger the system prompt
        CGImageRef img = CGWindowListCreateImage(
            CGRectMake(0, 0, 1, 1),
            kCGWindowListOptionOnScreenOnly,
            kCGNullWindowID,
            kCGWindowImageDefault);
        if (img) CGImageRelease(img);
    }
    return env.Undefined();
}

static Napi::Value RequestAccessibilityPermission(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    @autoreleasepool {
        NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
        AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    }
    return env.Undefined();
}

// ──────────────────────────────────────────────
// 10. H.264 stream management
// ──────────────────────────────────────────────

// startH264Stream(windowId, callback): starts SCStream + VT H.264 encoding.
// callback(err, { data: Buffer, isKeyframe, width, height, dpi, isFirst, timestamp })
static Napi::Value StartH264Stream(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected (windowId, callback)").ThrowAsJavaScriptException();
        return env.Null();
    }
    uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
    Napi::Function callback = info[1].As<Napi::Function>();

    // Bring the window to front / un-minimize before streaming so SCStream
    // captures real content instead of blank frames.
    ensureWindowReady(windowId);

#if HAS_SCREENCAPTUREKIT
    if (@available(macOS 12.3, *)) {
        // Stop any existing stream
        {
            std::lock_guard<std::mutex> lock(g_h264Mutex);
            auto it = g_h264Streams.find(windowId);
            if (it != g_h264Streams.end()) {
                // Will be cleaned up below
            }
        }
        stopH264Stream(windowId);

        auto ctx = std::make_shared<H264StreamContext>();
        ctx->windowId = windowId;
        ctx->dpi = (int)[[NSScreen mainScreen] backingScaleFactor];

        // Create thread-safe function for calling back to JS
        ctx->tsfn = Napi::ThreadSafeFunction::New(env, callback, "H264StreamCB", 0, 1);

        __block bool success = false;
        __block int outWidth = 0, outHeight = 0;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);

        [SCShareableContent getShareableContentWithCompletionHandler:
            ^(SCShareableContent *content, NSError *error) {
            if (error || !content) {
                dispatch_semaphore_signal(sem);
                return;
            }
            SCWindow *targetWindow = nil;
            for (SCWindow *w in content.windows) {
                if (w.windowID == windowId) {
                    targetWindow = w;
                    break;
                }
            }
            if (!targetWindow || targetWindow.frame.size.width == 0 || targetWindow.frame.size.height == 0) {
                dispatch_semaphore_signal(sem);
                return;
            }

            int scaleFactor = ctx->dpi;
            int w = (int)(targetWindow.frame.size.width * scaleFactor);
            int h = (int)(targetWindow.frame.size.height * scaleFactor);
            outWidth = w;
            outHeight = h;
            ctx->configuredWidth = w;
            ctx->configuredHeight = h;
            ctx->lastBoundsCheckTime = CACurrentMediaTime();

            SCContentFilter *filter = [[SCContentFilter alloc]
                initWithDesktopIndependentWindow:targetWindow];
            SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
            config.width = (size_t)w;
            config.height = (size_t)h;
            config.scalesToFit = YES;
            config.showsCursor = NO;
            config.pixelFormat = kCVPixelFormatType_32BGRA;
            config.minimumFrameInterval = CMTimeMake(1, ctx->targetFps);

            WindowH264StreamHandler *handler = [[WindowH264StreamHandler alloc] initWithContext:ctx];
            SCStream *scStream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:handler];

            NSError *addOutputErr = nil;
            [scStream addStreamOutput:handler type:SCStreamOutputTypeScreen
                sampleHandlerQueue:[handler frameQueue] error:&addOutputErr];
            if (addOutputErr) {
                dispatch_semaphore_signal(sem);
                return;
            }

            ctx->stream = scStream;
            ctx->streamHandler = handler;

            [scStream startCaptureWithCompletionHandler:^(NSError *startErr) {
                if (!startErr) {
                    std::lock_guard<std::mutex> lock(g_h264Mutex);
                    g_h264Streams[windowId] = ctx;
                    success = true;
                }
                dispatch_semaphore_signal(sem);
            }];
        }];

        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));

        if (success) {
            Napi::Object result = Napi::Object::New(env);
            result.Set("width", outWidth);
            result.Set("height", outHeight);
            result.Set("dpi", ctx->dpi);
            return result;
        }

        // Failed — release TSFN
        ctx->tsfn.Release();
        return env.Null();
    }
#endif
    Napi::Error::New(env, "H.264 streaming requires macOS 12.3+ with ScreenCaptureKit").ThrowAsJavaScriptException();
    return env.Null();
}

static Napi::Value StopH264Stream(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        return env.Undefined();
    }
    uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
#if HAS_SCREENCAPTUREKIT
    if (@available(macOS 12.3, *)) {
        stopH264Stream(windowId);
    }
#endif
    return env.Undefined();
}

static Napi::Value SetStreamFps(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) return env.Undefined();
    uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
    int fps = info[1].As<Napi::Number>().Int32Value();
    if (fps < 1 || fps > 120) return env.Undefined();

    std::lock_guard<std::mutex> lock(g_h264Mutex);
    auto it = g_h264Streams.find(windowId);
    if (it == g_h264Streams.end()) return env.Undefined();
    auto &ctx = it->second;

    std::lock_guard<std::mutex> ctxLock(ctx->encodeMutex);
    ctx->targetFps = fps;
    if (ctx->vtSession) {
        CFNumberRef fpsRef = CFNumberCreate(NULL, kCFNumberIntType, &fps);
        VTSessionSetProperty(ctx->vtSession, kVTCompressionPropertyKey_ExpectedFrameRate, fpsRef);
        CFRelease(fpsRef);
        int keyInterval = fps * 10;
        CFNumberRef keyRef = CFNumberCreate(NULL, kCFNumberIntType, &keyInterval);
        VTSessionSetProperty(ctx->vtSession, kVTCompressionPropertyKey_MaxKeyFrameInterval, keyRef);
        CFRelease(keyRef);
    }
    // Update SCStream frame interval
#if HAS_SCREENCAPTUREKIT
    if (@available(macOS 12.3, *)) {
        if (ctx->stream) {
            SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
            config.minimumFrameInterval = CMTimeMake(1, fps);
            [(SCStream *)ctx->stream updateConfiguration:config completionHandler:nil];
        }
    }
#endif
    return env.Undefined();
}

static Napi::Value SetStreamBitrate(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) return env.Undefined();
    uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
    int bitrate = info[1].As<Napi::Number>().Int32Value();
    if (bitrate < 100000) return env.Undefined(); // min 100kbps

    std::lock_guard<std::mutex> lock(g_h264Mutex);
    auto it = g_h264Streams.find(windowId);
    if (it == g_h264Streams.end()) return env.Undefined();
    auto &ctx = it->second;

    std::lock_guard<std::mutex> ctxLock(ctx->encodeMutex);
    ctx->targetBitrate = bitrate;
    if (ctx->vtSession) {
        CFNumberRef brRef = CFNumberCreate(NULL, kCFNumberIntType, &bitrate);
        VTSessionSetProperty(ctx->vtSession, kVTCompressionPropertyKey_AverageBitRate, brRef);
        CFRelease(brRef);
    }
    return env.Undefined();
}

// ──────────────────────────────────────────────
// Module init
// ──────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
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

NODE_API_MODULE(AppsMac, Init)
