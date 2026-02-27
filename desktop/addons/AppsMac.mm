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
                // Look up by PID
                for (NSRunningApplication *ra in [[NSWorkspace sharedWorkspace] runningApplications]) {
                    if (ra.processIdentifier == wPid) {
                        isFocused = ra.isActive;
                        isHidden = ra.isHidden;
                        break;
                    }
                }

                Napi::Object obj = Napi::Object::New(env);
                obj.Set("id", std::to_string(windowId));
                obj.Set("title", nsStringToStd(title));
                obj.Set("isFocused", isFocused);
                obj.Set("isHidden", isHidden);
                obj.Set("isMinimized", false);
                obj.Set("isMaximized", false);
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
            const uint8_t *pixels = CFDataGetBytePtr(rawData);

            int cols = (imgWidth + tileSize - 1) / tileSize;
            int rows = (imgHeight + tileSize - 1) / tileSize;

            // Lock cache
            std::lock_guard<std::mutex> lock(g_cacheMutex);
            TileHashCache &cache = g_windowCaches[windowId];

            double now = [[NSDate date] timeIntervalSince1970] * 1000.0;

            // Create a bitmap context for tile extraction
            CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();

            for (int row = 0; row < rows; row++) {
                for (int col = 0; col < cols; col++) {
                    int tileX = col * tileSize;
                    int tileY = row * tileSize;
                    int tw = std::min(tileSize, imgWidth - tileX);
                    int th = std::min(tileSize, imgHeight - tileY);

                    // Compute hash of this tile's pixels
                    uint64_t tileHash = 14695981039346656037ULL;
                    for (int y = tileY; y < tileY + th; y++) {
                        const uint8_t *rowPtr = pixels + y * bytesPerRow + tileX * bpp;
                        size_t rowBytes = tw * bpp;
                        for (size_t b = 0; b < rowBytes; b++) {
                            tileHash ^= rowPtr[b];
                            tileHash *= 1099511628211ULL;
                        }
                    }

                    uint64_t key = ((uint64_t)col << 32) | (uint64_t)row;
                    auto it = cache.hashes.find(key);
                    bool changed = (it == cache.hashes.end()) || (it->second != tileHash);

                    // If delta mode and tile hasn't changed, skip
                    if (sinceTimestamp > 0 && !changed) continue;

                    cache.hashes[key] = tileHash;

                    // Extract tile as JPEG
                    CGRect tileRect = CGRectMake(tileX, tileY, tw, th);
                    CGImageRef tileImage = CGImageCreateWithImageInRect(image, tileRect);
                    if (!tileImage) continue;

                    NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:tileImage];
                    NSDictionary *props = @{NSImageCompressionFactor: @(quality)};
                    NSData *jpegData = [rep representationUsingType:NSBitmapImageFileTypeJPEG properties:props];
                    CGImageRelease(tileImage);

                    if (!jpegData) continue;

                    // base64 encode
                    NSString *b64 = [jpegData base64EncodedStringWithOptions:0];

                    TileResult tile;
                    tile.xIndex = col;
                    tile.yIndex = row;
                    tile.width = tw;
                    tile.height = th;
                    tile.image = nsStringToStd(b64);
                    tile.timestamp = now;
                    tiles.push_back(tile);
                }
            }

            CGColorSpaceRelease(colorSpace);
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
            t.Set("image", tiles[i].image);
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
        std::string image;
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

// Helper: bring the window's owning application to front
static void focusWindowApp(uint32_t windowId) {
    @autoreleasepool {
        CFArrayRef windowList = CGWindowListCopyWindowInfo(
            kCGWindowListOptionIncludingWindow, windowId);
        if (!windowList || CFArrayGetCount(windowList) == 0) {
            if (windowList) CFRelease(windowList);
            return;
        }
        NSDictionary *wInfo = (__bridge NSDictionary *)CFArrayGetValueAtIndex(windowList, 0);
        pid_t pid = [wInfo[(__bridge NSString *)kCGWindowOwnerPID] intValue];
        CFRelease(windowList);

        NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
        if (app) {
            [app activateWithOptions:NSApplicationActivateIgnoringOtherApps];
        }
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

static void postMouseClick(CGPoint point, CGMouseButton button, bool isRightClick) {
    CGEventType downType = isRightClick ? kCGEventRightMouseDown : kCGEventLeftMouseDown;
    CGEventType upType = isRightClick ? kCGEventRightMouseUp : kCGEventLeftMouseUp;

    CGEventRef down = CGEventCreateMouseEvent(NULL, downType, point, button);
    CGEventRef up = CGEventCreateMouseEvent(NULL, upType, point, button);
    if (down) { CGEventPost(kCGHIDEventTap, down); CFRelease(down); }
    usleep(30000); // 30ms between down and up
    if (up) { CGEventPost(kCGHIDEventTap, up); CFRelease(up); }
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
    usleep(20000);
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
            usleep(10000); // 10ms between chars
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
        focusWindowApp(windowId);
    }
    else if (action == "minimize") {
        // Use Accessibility API to minimize
        @autoreleasepool {
            CFArrayRef windowList = CGWindowListCopyWindowInfo(
                kCGWindowListOptionIncludingWindow, windowId);
            if (windowList && CFArrayGetCount(windowList) > 0) {
                NSDictionary *wInfo = (__bridge NSDictionary *)CFArrayGetValueAtIndex(windowList, 0);
                pid_t pid = [wInfo[(__bridge NSString *)kCGWindowOwnerPID] intValue];
                CFRelease(windowList);

                AXUIElementRef appRef = AXUIElementCreateApplication(pid);
                CFArrayRef axWindows = NULL;
                AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef *)&axWindows);
                if (axWindows) {
                    // Find matching window and minimize
                    for (CFIndex i = 0; i < CFArrayGetCount(axWindows); i++) {
                        AXUIElementRef win = (AXUIElementRef)CFArrayGetValueAtIndex(axWindows, i);
                        AXUIElementSetAttributeValue(win, kAXMinimizedAttribute, kCFBooleanTrue);
                        break; // minimize first window
                    }
                    CFRelease(axWindows);
                }
                CFRelease(appRef);
            } else {
                if (windowList) CFRelease(windowList);
            }
        }
    }
    else if (action == "maximize") {
        // Use Accessibility API zoom button
        @autoreleasepool {
            CFArrayRef windowList = CGWindowListCopyWindowInfo(
                kCGWindowListOptionIncludingWindow, windowId);
            if (windowList && CFArrayGetCount(windowList) > 0) {
                NSDictionary *wInfo = (__bridge NSDictionary *)CFArrayGetValueAtIndex(windowList, 0);
                pid_t pid = [wInfo[(__bridge NSString *)kCGWindowOwnerPID] intValue];
                CFRelease(windowList);

                AXUIElementRef appRef = AXUIElementCreateApplication(pid);
                CFArrayRef axWindows = NULL;
                AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef *)&axWindows);
                if (axWindows && CFArrayGetCount(axWindows) > 0) {
                    AXUIElementRef win = (AXUIElementRef)CFArrayGetValueAtIndex(axWindows, 0);
                    // Get screen size and set window to full screen
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
                    CFRelease(axWindows);
                }
                CFRelease(appRef);
            } else {
                if (windowList) CFRelease(windowList);
            }
        }
    }
    else if (action == "restore") {
        // Un-minimize
        @autoreleasepool {
            CFArrayRef windowList = CGWindowListCopyWindowInfo(
                kCGWindowListOptionIncludingWindow, windowId);
            if (windowList && CFArrayGetCount(windowList) > 0) {
                NSDictionary *wInfo = (__bridge NSDictionary *)CFArrayGetValueAtIndex(windowList, 0);
                pid_t pid = [wInfo[(__bridge NSString *)kCGWindowOwnerPID] intValue];
                CFRelease(windowList);

                AXUIElementRef appRef = AXUIElementCreateApplication(pid);
                CFArrayRef axWindows = NULL;
                AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef *)&axWindows);
                if (axWindows) {
                    for (CFIndex i = 0; i < CFArrayGetCount(axWindows); i++) {
                        AXUIElementRef win = (AXUIElementRef)CFArrayGetValueAtIndex(axWindows, i);
                        AXUIElementSetAttributeValue(win, kAXMinimizedAttribute, kCFBooleanFalse);
                    }
                    CFRelease(axWindows);
                }
                CFRelease(appRef);
            } else {
                if (windowList) CFRelease(windowList);
            }
        }
    }
    else if (action == "close") {
        @autoreleasepool {
            CFArrayRef windowList = CGWindowListCopyWindowInfo(
                kCGWindowListOptionIncludingWindow, windowId);
            if (windowList && CFArrayGetCount(windowList) > 0) {
                NSDictionary *wInfo = (__bridge NSDictionary *)CFArrayGetValueAtIndex(windowList, 0);
                pid_t pid = [wInfo[(__bridge NSString *)kCGWindowOwnerPID] intValue];
                CFRelease(windowList);

                AXUIElementRef appRef = AXUIElementCreateApplication(pid);
                CFArrayRef axWindows = NULL;
                AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef *)&axWindows);
                if (axWindows && CFArrayGetCount(axWindows) > 0) {
                    AXUIElementRef win = (AXUIElementRef)CFArrayGetValueAtIndex(axWindows, 0);
                    // Press close button
                    AXUIElementRef closeButton = NULL;
                    AXUIElementCopyAttributeValue(win, kAXCloseButtonAttribute, (CFTypeRef *)&closeButton);
                    if (closeButton) {
                        AXUIElementPerformAction(closeButton, kAXPressAction);
                        CFRelease(closeButton);
                    }
                    CFRelease(axWindows);
                }
                CFRelease(appRef);
            } else {
                if (windowList) CFRelease(windowList);
            }
        }
    }
    else if (action == "click" || action == "rightClick") {
        double x = payload.Has("x") ? payload.Get("x").As<Napi::Number>().DoubleValue() : 0;
        double y = payload.Has("y") ? payload.Get("y").As<Napi::Number>().DoubleValue() : 0;

        // x, y are relative to the window — convert to screen coords
        CGRect bounds = getWindowBounds(windowId);
        CGPoint screenPoint = CGPointMake(bounds.origin.x + x, bounds.origin.y + y);

        focusWindowApp(windowId);
        usleep(50000); // wait for app focus
        CGWarpMouseCursorPosition(screenPoint);
        CGAssociateMouseAndMouseCursorPosition(true);
        usleep(20000);

        bool isRight = (action == "rightClick");
        postMouseClick(screenPoint, isRight ? kCGMouseButtonRight : kCGMouseButtonLeft, isRight);
    }
    else if (action == "hover") {
        double x = payload.Has("x") ? payload.Get("x").As<Napi::Number>().DoubleValue() : 0;
        double y = payload.Has("y") ? payload.Get("y").As<Napi::Number>().DoubleValue() : 0;

        CGRect bounds = getWindowBounds(windowId);
        CGPoint screenPoint = CGPointMake(bounds.origin.x + x, bounds.origin.y + y);
        CGWarpMouseCursorPosition(screenPoint);
        postMouseMove(screenPoint);
    }
    else if (action == "textInput") {
        std::string text = payload.Has("text") ? payload.Get("text").As<Napi::String>().Utf8Value() : "";
        focusWindowApp(windowId);
        usleep(100000);
        postTextInput(text);
    }
    else if (action == "keyInput") {
        std::string key = payload.Has("key") ? payload.Get("key").As<Napi::String>().Utf8Value() : "";
        focusWindowApp(windowId);
        usleep(100000);
        postKeyInput(key);
    }
    else if (action == "scroll") {
        double x = payload.Has("x") ? payload.Get("x").As<Napi::Number>().DoubleValue() : 0;
        double y = payload.Has("y") ? payload.Get("y").As<Napi::Number>().DoubleValue() : 0;
        int32_t deltaX = payload.Has("scrollDeltaX") ? payload.Get("scrollDeltaX").As<Napi::Number>().Int32Value() : 0;
        int32_t deltaY = payload.Has("scrollDeltaY") ? payload.Get("scrollDeltaY").As<Napi::Number>().Int32Value() : 0;

        CGRect bounds = getWindowBounds(windowId);
        CGPoint screenPoint = CGPointMake(bounds.origin.x + x, bounds.origin.y + y);

        focusWindowApp(windowId);
        usleep(50000);
        CGWarpMouseCursorPosition(screenPoint);
        usleep(20000);
        postScroll(deltaX, deltaY);
    }
    else if (action == "resize") {
        double newWidth = payload.Has("newWidth") ? payload.Get("newWidth").As<Napi::Number>().DoubleValue() : 0;
        double newHeight = payload.Has("newHeight") ? payload.Get("newHeight").As<Napi::Number>().DoubleValue() : 0;
        if (newWidth <= 0 || newHeight <= 0) {
            Napi::Error::New(env, "resize requires positive newWidth and newHeight").ThrowAsJavaScriptException();
            return env.Null();
        }
        @autoreleasepool {
            CFArrayRef windowList = CGWindowListCopyWindowInfo(
                kCGWindowListOptionIncludingWindow, windowId);
            if (windowList && CFArrayGetCount(windowList) > 0) {
                NSDictionary *wInfo = (__bridge NSDictionary *)CFArrayGetValueAtIndex(windowList, 0);
                pid_t pid = [wInfo[(__bridge NSString *)kCGWindowOwnerPID] intValue];
                CFRelease(windowList);

                AXUIElementRef appRef = AXUIElementCreateApplication(pid);
                CFArrayRef axWindows = NULL;
                AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef *)&axWindows);
                if (axWindows && CFArrayGetCount(axWindows) > 0) {
                    AXUIElementRef win = (AXUIElementRef)CFArrayGetValueAtIndex(axWindows, 0);
                    CGSize size = CGSizeMake(newWidth, newHeight);
                    AXValueRef sizeVal = AXValueCreate((AXValueType)kAXValueCGSizeType, &size);
                    AXUIElementSetAttributeValue(win, kAXSizeAttribute, sizeVal);
                    CFRelease(sizeVal);
                    CFRelease(axWindows);
                }
                CFRelease(appRef);
            } else {
                if (windowList) CFRelease(windowList);
            }
        }
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
