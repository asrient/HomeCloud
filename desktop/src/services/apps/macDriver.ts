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
    performAction(payload: RemoteAppWindowActionPayload): void;
    startH264Stream(
        callback: (err: Error | null, frame: H264FrameInfo) => void,
    ): H264StreamResult | null;
    stopH264Stream(): void;
    setStreamFps(fps: number): void;
    setStreamBitrate(bitrate: number): void;
    screenshotWindow(windowId: number): string | null;
    hasScreenRecordingPermission(): boolean;
    hasAccessibilityPermission(): boolean;
    requestScreenRecordingPermission(): void;
    requestAccessibilityPermission(): void;
}

export class MacAppsDriver extends AppsDriver {
    private _module: AppsMacModule | null = null;

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
        this.native.watchRunningApps(onLaunch, onQuit);
    }

    unwatchRunningApps(): void { this.native.unwatchRunningApps(); }

    // Full-screen streaming
    startH264ScreenStream(callback: (err: Error | null, frame: H264FrameInfo) => void): H264StreamResult | null {
        return this.native.startH264Stream(callback);
    }
    stopH264ScreenStream(): void { this.native.stopH264Stream(); }
    setScreenStreamFps(fps: number): void { this.native.setStreamFps(fps); }
    setScreenStreamBitrate(bitrate: number): void { this.native.setStreamBitrate(bitrate); }

    screenshotWindow(windowId: number): string | null { return this.native.screenshotWindow(windowId); }

    hasScreenRecordingPermission(): boolean { return this.native.hasScreenRecordingPermission(); }
    hasAccessibilityPermission(): boolean { return this.native.hasAccessibilityPermission(); }
    requestScreenRecordingPermission(): void { this.native.requestScreenRecordingPermission(); }
    requestAccessibilityPermission(): void { this.native.requestAccessibilityPermission(); }
}
