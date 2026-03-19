import { importModule } from "../../utils";
import { platform } from "os";
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppWindowActionPayload,
} from "shared/types";
import { AppsDriver, H264FrameInfo, H264StreamResult } from "./driver";

interface AppsMacModule {
    getInstalledApps(): RemoteAppInfo[];
    getRunningApps(): RemoteAppInfo[];
    watchRunningApps(onLaunch: (app: RemoteAppInfo) => void, onQuit: (app: RemoteAppInfo) => void): void;
    unwatchRunningApps(): void;
    launchApp(bundleId: string): void;
    quitApp(bundleId: string): void;
    getAppIcon(bundleId: string): string | null;
    getWindows(bundleId?: string): RemoteAppWindow[];
    watchAppWindows(
        bundleId: string,
        onCreated: (window: RemoteAppWindow) => void,
        onDestroyed: (window: RemoteAppWindow) => void,
    ): void;
    stopWatchingAppWindows(bundleId: string): void;
    performAction(payload: RemoteAppWindowActionPayload): void;
    startH264Stream(
        windowId: number,
        callback: (err: Error | null, frame: H264FrameInfo) => void,
    ): H264StreamResult | null;
    stopH264Stream(windowId: number): void;
    setStreamFps(windowId: number, fps: number): void;
    setStreamBitrate(windowId: number, bitrate: number): void;
    hasScreenRecordingPermission(): boolean;
    hasAccessibilityPermission(): boolean;
    requestScreenRecordingPermission(): void;
    requestAccessibilityPermission(): void;
}

export class MacAppsDriver extends AppsDriver {
    private _module: AppsMacModule | null = null;
    private windowWatchActive = false;
    private windowCreatedCb: ((app: RemoteAppInfo, win: RemoteAppWindow) => void) | null = null;
    private windowDestroyedCb: ((app: RemoteAppInfo, win: RemoteAppWindow) => void) | null = null;

    private get native(): AppsMacModule {
        if (!this._module) {
            if (platform() !== "darwin") throw new Error(`AppsMac not available on ${platform()}`);
            this._module = importModule("AppsMac") as AppsMacModule;
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
        this.native.watchRunningApps(
            (app) => {
                onLaunch(app);
                if (this.windowWatchActive) this.watchSingleApp(app);
            },
            (app) => {
                onQuit(app);
                if (this.windowWatchActive) this.native.stopWatchingAppWindows(app.id);
            },
        );
    }

    unwatchRunningApps(): void { this.native.unwatchRunningApps(); }

    startWindowWatching(
        onCreated: (app: RemoteAppInfo, win: RemoteAppWindow) => void,
        onDestroyed: (app: RemoteAppInfo, win: RemoteAppWindow) => void,
    ): void {
        this.windowCreatedCb = onCreated;
        this.windowDestroyedCb = onDestroyed;
        this.windowWatchActive = true;
        for (const app of this.native.getRunningApps()) {
            this.watchSingleApp(app);
        }
    }

    stopWindowWatching(): void {
        if (!this.windowWatchActive) return;
        this.windowWatchActive = false;
        for (const app of this.native.getRunningApps()) {
            this.native.stopWatchingAppWindows(app.id);
        }
        this.windowCreatedCb = null;
        this.windowDestroyedCb = null;
    }

    private watchSingleApp(app: RemoteAppInfo): void {
        this.native.watchAppWindows(
            app.id,
            (win) => this.windowCreatedCb?.(app, win),
            (win) => this.windowDestroyedCb?.(app, win),
        );
    }

    startH264Stream(windowId: number, callback: (err: Error | null, frame: H264FrameInfo) => void): H264StreamResult | null {
        return this.native.startH264Stream(windowId, callback);
    }
    stopH264Stream(windowId: number): void { this.native.stopH264Stream(windowId); }
    setStreamFps(windowId: number, fps: number): void { this.native.setStreamFps(windowId, fps); }
    setStreamBitrate(windowId: number, bitrate: number): void { this.native.setStreamBitrate(windowId, bitrate); }

    hasScreenRecordingPermission(): boolean { return this.native.hasScreenRecordingPermission(); }
    hasAccessibilityPermission(): boolean { return this.native.hasAccessibilityPermission(); }
    requestScreenRecordingPermission(): void { this.native.requestScreenRecordingPermission(); }
    requestAccessibilityPermission(): void { this.native.requestAccessibilityPermission(); }
}
