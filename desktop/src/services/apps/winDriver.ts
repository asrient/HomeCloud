import { importModule } from "../../utils";
import { platform } from "os";
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppWindowActionPayload,
} from "shared/types";
import { AppsDriver, H264FrameInfo, H264StreamResult } from "./driver";

interface AppsWinModule {
    getInstalledApps(): RemoteAppInfo[];
    getRunningApps(): RemoteAppInfo[];
    launchApp(appId: string): void;
    quitApp(appId: string): void;
    getAppIcon(appId: string): string | null;
    getWindows(appId?: string): RemoteAppWindow[];
    startWatchingWindows(
        onCreated: (app: RemoteAppInfo, window: RemoteAppWindow) => void,
        onDestroyed: (app: RemoteAppInfo, window: RemoteAppWindow) => void,
    ): void;
    stopWatchingWindows(): void;
    performAction(payload: RemoteAppWindowActionPayload): void;
    startH264Stream(
        callback: (err: Error | null, frame: H264FrameInfo) => void,
    ): H264StreamResult | null;
    stopH264Stream(): void;
    setStreamFps(fps: number): void;
    setStreamBitrate(bitrate: number): void;
    screenshotWindow(windowId: number): string | null;
}

export class WinAppsDriver extends AppsDriver {
    private _module: AppsWinModule | null = null;

    // App tracking state — derives app launch/quit from window events
    private knownAppIds = new Set<string>();
    private appLaunchCb: ((app: RemoteAppInfo) => void) | null = null;
    private appQuitCb: ((app: RemoteAppInfo) => void) | null = null;

    private get native(): AppsWinModule {
        if (!this._module) {
            if (platform() !== "win32") throw new Error(`AppsWin not available on ${platform()}`);
            this._module = importModule("AppsWin") as AppsWinModule;
        }
        return this._module;
    }

    getInstalledApps(): RemoteAppInfo[] { return this.native.getInstalledApps(); }
    getRunningApps(): RemoteAppInfo[] { return this.native.getRunningApps(); }
    launchApp(appId: string): void { this.native.launchApp(appId); }
    quitApp(appId: string): void { this.native.quitApp(appId); }
    getAppIcon(appId: string): string | null { return this.native.getAppIcon(appId); }
    getWindows(appId?: string): RemoteAppWindow[] { return this.native.getWindows(appId); }
    performAction(payload: RemoteAppWindowActionPayload): void { this.native.performAction(payload); }

    watchRunningApps(
        onLaunch: (app: RemoteAppInfo) => void,
        onQuit: (app: RemoteAppInfo) => void,
    ): void {
        this.appLaunchCb = onLaunch;
        this.appQuitCb = onQuit;

        // Snapshot current apps and their windows
        const running = this.getRunningApps();
        this.knownAppIds = new Set(running.map(a => a.id));

        // Start shell hook — all app/window events derived from here
        this.native.startWatchingWindows(
            (app, win) => this.onNativeWindowCreated(app, win),
            (app, win) => this.onNativeWindowDestroyed(app, win),
        );
    }

    unwatchRunningApps(): void {
        this.native.stopWatchingWindows();
        this.appLaunchCb = null;
        this.appQuitCb = null;
        this.knownAppIds.clear();
    }

    private onNativeWindowCreated(app: RemoteAppInfo, _win: RemoteAppWindow): void {
        if (app.id) {
            if (!this.knownAppIds.has(app.id)) {
                this.knownAppIds.add(app.id);
                this.appLaunchCb?.(app);
            }
        }
    }

    private onNativeWindowDestroyed(app: RemoteAppInfo, win: RemoteAppWindow): void {
        const appId = app.id || win.appId || '';
        const resolvedApp = app.id ? app : { name: '', id: appId, iconPath: null };
        if (appId && this.knownAppIds.has(appId)) {
            const remaining = this.getWindows(appId);
            if (remaining.length === 0) {
                this.knownAppIds.delete(appId);
                this.appQuitCb?.(resolvedApp);
            }
        }
    }

    // Full-screen streaming
    startH264ScreenStream(callback: (err: Error | null, frame: H264FrameInfo) => void): H264StreamResult | null {
        return this.native.startH264Stream(callback);
    }
    stopH264ScreenStream(): void { this.native.stopH264Stream(); }
    setScreenStreamFps(fps: number): void { this.native.setStreamFps(fps); }
    setScreenStreamBitrate(bitrate: number): void { this.native.setStreamBitrate(bitrate); }

    screenshotWindow(windowId: number): string | null { return this.native.screenshotWindow(windowId); }
}
