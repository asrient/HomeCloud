/**
 * AppsMac.mm
 *
 * Node N-API native addon for macOS remote-desktop functionality.
 *
 * Provides:
 *   - getInstalledApps()        → list installed GUI apps from /Applications
 *   - getRunningApps()          → list running GUI apps (NSWorkspace)
 *   - getAppState(bundleId)     → running / focused state + windows
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
#include <unordered_map>
#include <vector>
#include <string>
#include <mutex>
#include <cstring>
#include <dispatch/dispatch.h>
#if defined(__arm64__) || defined(__aarch64__)
#include <arm_acle.h>
#elif defined(__x86_64__)
#include <nmmintrin.h>
#endif

// Private AX API: map AXUIElementRef → CGWindowID
extern "C" AXError _AXUIElementGetWindow(AXUIElementRef element, uint32_t *windowID);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

static std::string nsStringToStd(NSString *s) {
    return s ? std::string([s UTF8String]) : "";
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
static std::unordered_map<uint32_t, TileHashCache> g_windowCaches; // windowId → cache

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

                NSString *iconFile = [[bundle infoDictionary] objectForKey:@"CFBundleIconFile"];
                NSString *iconPath = nil;
                if (iconFile) {
                    if (![iconFile hasSuffix:@".icns"]) iconFile = [iconFile stringByAppendingString:@".icns"];
                    iconPath = [[bundle resourcePath] stringByAppendingPathComponent:iconFile];
                    if (![fm fileExistsAtPath:iconPath]) iconPath = nil;
                }

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
                NSBundle *bundle = [NSBundle bundleWithURL:app.bundleURL];
                NSString *iconFile = [[bundle infoDictionary] objectForKey:@"CFBundleIconFile"];
                if (iconFile) {
                    if (![iconFile hasSuffix:@".icns"]) iconFile = [iconFile stringByAppendingString:@".icns"];
                    iconPath = [[bundle resourcePath] stringByAppendingPathComponent:iconFile];
                }
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
// 3. App state
// ──────────────────────────────────────────────
static Napi::Value GetAppState(const Napi::CallbackInfo &info) {
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

        Napi::Object result = Napi::Object::New(env);
        if (apps.count == 0) {
            result.Set("isRunning", false);
            result.Set("isFocused", false);
            return result;
        }

        NSRunningApplication *app = apps.firstObject;
        result.Set("isRunning", true);
        result.Set("isFocused", (bool)app.isActive);

        // Get windows for this app via CGWindowList
        pid_t pid = app.processIdentifier;
        CFArrayRef windowList = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
            kCGNullWindowID);

        Napi::Array windows = Napi::Array::New(env);
        uint32_t wIdx = 0;
        if (windowList) {
            NSArray *wl = (__bridge NSArray *)windowList;
            for (NSDictionary *w in wl) {
                pid_t wPid = [w[(__bridge NSString *)kCGWindowOwnerPID] intValue];
                if (wPid != pid) continue;
                int layer = [w[(__bridge NSString *)kCGWindowLayer] intValue];
                float alpha = [w[(__bridge NSString *)kCGWindowAlpha] floatValue];
                NSDictionary *bounds = w[(__bridge NSString *)kCGWindowBounds];
                double width = [bounds[@"Width"] doubleValue];
                double height = [bounds[@"Height"] doubleValue];
                if (layer != 0 || alpha < 0.01 || width < 50 || height < 50) continue;

                uint32_t windowId = [w[(__bridge NSString *)kCGWindowNumber] unsignedIntValue];
                NSString *title = w[(__bridge NSString *)kCGWindowName];

                Napi::Object wObj = Napi::Object::New(env);
                wObj.Set("id", std::to_string(windowId));
                wObj.Set("title", nsStringToStd(title));
                wObj.Set("isFocused", (bool)app.isActive); // per-window focus not available from CG
                wObj.Set("isHidden", (bool)app.isHidden);
                wObj.Set("isMinimized", false); // on-screen only, so not minimized
                wObj.Set("isMaximized", false);
                windows.Set(wIdx++, wObj);
            }
            CFRelease(windowList);
        }
        result.Set("windows", windows);
        return result;
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
        if (windowList) {
            NSArray *wl = (__bridge NSArray *)windowList;

            // First pass: collect normal (layer 0) windows and build a PID→windowId map
            // so popup windows can reference their parent.
            std::unordered_map<pid_t, std::string> pidToParentWindowId;

            for (NSDictionary *w in wl) {
                pid_t wPid = [w[(__bridge NSString *)kCGWindowOwnerPID] intValue];
                if (filterPid != -1 && wPid != filterPid) continue;

                int layer = [w[(__bridge NSString *)kCGWindowLayer] intValue];
                float alpha = [w[(__bridge NSString *)kCGWindowAlpha] floatValue];
                NSDictionary *bounds = w[(__bridge NSString *)kCGWindowBounds];
                double width = [bounds[@"Width"] doubleValue];
                double height = [bounds[@"Height"] doubleValue];
                if (layer != 0 || alpha < 0.01 || width < 50 || height < 50) continue;

                uint32_t windowId = [w[(__bridge NSString *)kCGWindowNumber] unsignedIntValue];
                NSString *title = w[(__bridge NSString *)kCGWindowName];

                // Determine focus state from owning app
                bool isFocused = false;
                bool isHidden = false;
                for (NSRunningApplication *ra in [[NSWorkspace sharedWorkspace] runningApplications]) {
                    if (ra.processIdentifier == wPid) {
                        isFocused = ra.isActive;
                        isHidden = ra.isHidden;
                        break;
                    }
                }

                std::string idStr = std::to_string(windowId);

                // Remember the first normal window per PID as the parent for popups
                if (pidToParentWindowId.find(wPid) == pidToParentWindowId.end()) {
                    pidToParentWindowId[wPid] = idStr;
                }

                Napi::Object obj = Napi::Object::New(env);
                obj.Set("id", idStr);
                obj.Set("title", nsStringToStd(title));
                obj.Set("isFocused", isFocused);
                obj.Set("isHidden", isHidden);
                obj.Set("isMinimized", false);
                obj.Set("isMaximized", false);
                arr.Set(idx++, obj);
            }

            // Second pass: collect popup/menu windows (layer > 0) from the same process
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
                obj.Set("isFocused", false);
                obj.Set("isHidden", false);
                obj.Set("isMinimized", false);
                obj.Set("isMaximized", false);
                obj.Set("parentWindowId", parentIt->second);
                arr.Set(idx++, obj);
            }

            CFRelease(windowList);
        }
        return arr;
    }
}

// ──────────────────────────────────────────────
// 7. Capture window — tile-based with delta
// ──────────────────────────────────────────────
//
// captureWindow(windowId: number, tileSize: number, quality: number, sinceTimestamp: number, callback)
// callback(err, { x, y, width, height, tiles: [{xIndex, yIndex, width, height, image, timestamp}] })
//

class CaptureWorker : public Napi::AsyncWorker {
public:
    CaptureWorker(const Napi::Function &cb, uint32_t windowId, int tileSize, double quality, double sinceTimestamp)
        : Napi::AsyncWorker(cb), windowId(windowId), tileSize(tileSize),
          quality(quality), sinceTimestamp(sinceTimestamp) {}

    void Execute() override {
        @autoreleasepool {
            // Capture the window
            CGImageRef image = CGWindowListCreateImage(
                CGRectNull,
                kCGWindowListOptionIncludingWindow,
                windowId,
                kCGWindowImageBoundsIgnoreFraming | kCGWindowImageNominalResolution);

            if (!image) {
                SetError("Failed to capture window");
                return;
            }

            imgWidth = (int)CGImageGetWidth(image);
            imgHeight = (int)CGImageGetHeight(image);

            // Get window bounds for position
            CFArrayRef windowList = CGWindowListCopyWindowInfo(
                kCGWindowListOptionIncludingWindow, windowId);
            if (windowList && CFArrayGetCount(windowList) > 0) {
                NSDictionary *wInfo = (__bridge NSDictionary *)CFArrayGetValueAtIndex(windowList, 0);
                NSDictionary *bounds = wInfo[(__bridge NSString *)kCGWindowBounds];
                winX = [bounds[@"X"] doubleValue];
                winY = [bounds[@"Y"] doubleValue];
            }
            if (windowList) CFRelease(windowList);

            // Get raw pixel data
            size_t bpp = CGImageGetBitsPerPixel(image) / 8;
            size_t bytesPerRow = CGImageGetBytesPerRow(image);
            CGDataProviderRef provider = CGImageGetDataProvider(image);
            CFDataRef rawData = CGDataProviderCopyData(provider);
            if (!rawData) {
                CGImageRelease(image);
                SetError("Failed to copy pixel data");
                return;
            }
            const uint8_t *pixels = CFDataGetBytePtr(rawData);

            int cols = (imgWidth + tileSize - 1) / tileSize;
            int rows = (imgHeight + tileSize - 1) / tileSize;

            // ── Phase 1: Hash all tiles, collect dirty list (under lock) ──
            struct PendingTile {
                int col, row, tileX, tileY, tw, th;
            };
            std::vector<PendingTile> changedTiles;

            {
                std::lock_guard<std::mutex> lock(g_cacheMutex);
                TileHashCache &cache = g_windowCaches[windowId];

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
                        int tw = std::min(tileSize, imgWidth - tileX);
                        int th = std::min(tileSize, imgHeight - tileY);

                        // Compute hash of this tile's pixels (hardware CRC32)
                        uint32_t tileHash = 0;
                        for (int y = tileY; y < tileY + th; y++) {
                            const uint8_t *rowPtr = pixels + y * bytesPerRow + tileX * bpp;
                            size_t tileRowBytes = tw * bpp;
                            size_t chunks = tileRowBytes / 8;
                            const uint64_t *ptr64 = reinterpret_cast<const uint64_t *>(rowPtr);
#if defined(__arm64__) || defined(__aarch64__)
                            for (size_t c = 0; c < chunks; c++) {
                                tileHash = __crc32cd(tileHash, ptr64[c]);
                            }
                            for (size_t b = chunks * 8; b < tileRowBytes; b++) {
                                tileHash = __crc32cb(tileHash, rowPtr[b]);
                            }
#elif defined(__x86_64__)
                            for (size_t c = 0; c < chunks; c++) {
                                tileHash = (uint32_t)_mm_crc32_u64(tileHash, ptr64[c]);
                            }
                            for (size_t b = chunks * 8; b < tileRowBytes; b++) {
                                tileHash = _mm_crc32_u8(tileHash, rowPtr[b]);
                            }
#else
                            for (size_t c = 0; c < chunks; c++) {
                                tileHash ^= (uint32_t)(ptr64[c] ^ (ptr64[c] >> 32));
                                tileHash *= 16777619u;
                            }
                            for (size_t b = chunks * 8; b < tileRowBytes; b++) {
                                tileHash ^= rowPtr[b];
                                tileHash *= 16777619u;
                            }
#endif
                        }

                        uint64_t key = ((uint64_t)col << 32) | (uint64_t)row;
                        auto it = cache.hashes.find(key);
                        bool changed = (it == cache.hashes.end()) || (it->second != tileHash);

                        // If delta mode and tile hasn't changed, skip
                        if (sinceTimestamp > 0 && !changed) continue;

                        cache.hashes[key] = tileHash;
                        changedTiles.push_back({col, row, tileX, tileY, tw, th});
                    }
                }
            } // mutex released

            // ── Phase 2: JPEG-encode dirty tiles in parallel via GCD ──
            double now = [[NSDate date] timeIntervalSince1970] * 1000.0;
            size_t count = changedTiles.size();
            tiles.resize(count);

            // Initialize all tiles as failed; successful encodes overwrite
            for (size_t i = 0; i < count; i++) {
                tiles[i].width = 0;
            }

            auto encodeOneTile = [&](size_t i) {
                @autoreleasepool {
                    auto &ct = changedTiles[i];
                    CGRect tileRect = CGRectMake(ct.tileX, ct.tileY, ct.tw, ct.th);
                    CGImageRef tileImage = CGImageCreateWithImageInRect(image, tileRect);
                    if (!tileImage) return;

                    NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:tileImage];
                    NSDictionary *props = @{NSImageCompressionFactor: @(quality)};
                    NSData *jpegData = [rep representationUsingType:NSBitmapImageFileTypeJPEG properties:props];
                    CGImageRelease(tileImage);

                    if (!jpegData) return;

                    tiles[i].xIndex = ct.col;
                    tiles[i].yIndex = ct.row;
                    tiles[i].width = ct.tw;
                    tiles[i].height = ct.th;
                    const uint8_t *bytes = (const uint8_t *)[jpegData bytes];
                    tiles[i].imageData.assign(bytes, bytes + [jpegData length]);
                    tiles[i].timestamp = now;
                }
            };

            if (count >= 3) {
                dispatch_apply(count, dispatch_get_global_queue(QOS_CLASS_USER_INTERACTIVE, 0), ^(size_t i) {
                    encodeOneTile(i);
                });
            } else {
                for (size_t i = 0; i < count; i++) {
                    encodeOneTile(i);
                }
            }

            // Remove failed tiles (width == 0)
            tiles.erase(std::remove_if(tiles.begin(), tiles.end(),
                [](const TileResult &t) { return t.width == 0; }), tiles.end());

            CFRelease(rawData);
            CGImageRelease(image);
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
            t.Set("image", Napi::Buffer<uint8_t>::Copy(
                Env(), tiles[i].imageData.data(), tiles[i].imageData.size()));
            t.Set("timestamp", tiles[i].timestamp);
            tilesArr.Set(i, t);
        }
        result.Set("tiles", tilesArr);
        Callback().Call({Env().Null(), result});
    }

private:
    uint32_t windowId;
    int tileSize;
    double quality;
    double sinceTimestamp;
    int imgWidth = 0;
    int imgHeight = 0;
    double winX = 0;
    double winY = 0;

    struct TileResult {
        int xIndex, yIndex, width, height;
        std::vector<uint8_t> imageData;
        double timestamp;
    };
    std::vector<TileResult> tiles;
};

static Napi::Value CaptureWindow(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 5) {
        Napi::TypeError::New(env, "Expected (windowId, tileSize, quality, sinceTimestamp, callback)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
    int tileSize = info[1].As<Napi::Number>().Int32Value();
    double quality = info[2].As<Napi::Number>().DoubleValue();
    double sinceTimestamp = info[3].As<Napi::Number>().DoubleValue();
    Napi::Function cb = info[4].As<Napi::Function>();

    auto *worker = new CaptureWorker(cb, windowId, tileSize, quality, sinceTimestamp);
    worker->Queue();
    return env.Undefined();
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
        if (pid < 0) return false;

        NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
        if (!app) return false;

        bool needsWait = false;

        // 2. Activate the app only if it isn't already frontmost
        if (![app isActive]) {
            [app activateWithOptions:NSApplicationActivateIgnoringOtherApps];
            needsWait = true;
        }

        // 3. Find and prepare the target window via AX API
        bool wasMinimized = false;
        AXUIElementRef appRef = AXUIElementCreateApplication(pid);
        CFArrayRef axWindows = NULL;
        AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef *)&axWindows);
        if (axWindows) {
            AXUIElementRef targetWin = axWindowForId(windowId, axWindows);
            if (!targetWin && CFArrayGetCount(axWindows) > 0) {
                targetWin = (AXUIElementRef)CFArrayGetValueAtIndex(axWindows, 0);
            }
            if (targetWin) {
                // Un-minimize only the target window if needed
                CFBooleanRef minimized = NULL;
                AXUIElementCopyAttributeValue(targetWin, kAXMinimizedAttribute, (CFTypeRef *)&minimized);
                if (minimized && CFBooleanGetValue(minimized)) {
                    AXUIElementSetAttributeValue(targetWin, kAXMinimizedAttribute, kCFBooleanFalse);
                    wasMinimized = true;
                }
                if (minimized) CFRelease(minimized);
                // Raise the target window to front
                AXUIElementPerformAction(targetWin, kAXRaiseAction);
            }
            CFRelease(axWindows);
        }
        CFRelease(appRef);

        // Wait until the conditions we changed are met (max 500ms)
        if (needsWait || wasMinimized) {
            for (int i = 0; i < 25; i++) {
                usleep(20000);
                bool ready = [app isActive];
                if (wasMinimized) {
                    // Re-check minimized state of the target window
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
    CGEventFlags flags = 0;
    if (payload.Has("modifiers") && payload.Get("modifiers").IsArray()) {
        Napi::Array mods = payload.Get("modifiers").As<Napi::Array>();
        for (uint32_t i = 0; i < mods.Length(); i++) {
            std::string mod = mods.Get(i).As<Napi::String>().Utf8Value();
            if (mod == "shift") flags |= kCGEventFlagMaskShift;
            else if (mod == "cmd" || mod == "command" || mod == "meta") flags |= kCGEventFlagMaskCommand;
            else if (mod == "alt" || mod == "option") flags |= kCGEventFlagMaskAlternate;
            else if (mod == "ctrl" || mod == "control") flags |= kCGEventFlagMaskControl;
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
    CGEventFlags modifiers = 0;
    std::string mainKey = parts.back();

    for (size_t i = 0; i < parts.size() - 1; i++) {
        const auto &mod = parts[i];
        if (mod == "cmd" || mod == "command" || mod == "meta") modifiers |= kCGEventFlagMaskCommand;
        else if (mod == "shift") modifiers |= kCGEventFlagMaskShift;
        else if (mod == "alt" || mod == "option") modifiers |= kCGEventFlagMaskAlternate;
        else if (mod == "ctrl" || mod == "control") modifiers |= kCGEventFlagMaskControl;
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
        // Try to capture a 1x1 region — if screen recording is denied this returns NULL
        CGImageRef img = CGWindowListCreateImage(
            CGRectMake(0, 0, 1, 1),
            kCGWindowListOptionOnScreenOnly,
            kCGNullWindowID,
            kCGWindowImageDefault);
        bool hasPermission = (img != NULL);
        if (img) CGImageRelease(img);
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
// Module init
// ──────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getInstalledApps", Napi::Function::New(env, GetInstalledApps));
    exports.Set("getRunningApps", Napi::Function::New(env, GetRunningApps));
    exports.Set("getAppState", Napi::Function::New(env, GetAppState));
    exports.Set("launchApp", Napi::Function::New(env, LaunchApp));
    exports.Set("quitApp", Napi::Function::New(env, QuitApp));
    exports.Set("getAppIcon", Napi::Function::New(env, GetAppIcon));
    exports.Set("getWindows", Napi::Function::New(env, GetWindows));
    exports.Set("captureWindow", Napi::Function::New(env, CaptureWindow));
    exports.Set("performAction", Napi::Function::New(env, PerformAction));
    exports.Set("hasScreenRecordingPermission", Napi::Function::New(env, HasScreenRecordingPermission));
    exports.Set("hasAccessibilityPermission", Napi::Function::New(env, HasAccessibilityPermission));
    exports.Set("requestScreenRecordingPermission", Napi::Function::New(env, RequestScreenRecordingPermission));
    exports.Set("requestAccessibilityPermission", Napi::Function::New(env, RequestAccessibilityPermission));
    return exports;
}

NODE_API_MODULE(AppsMac, Init)
