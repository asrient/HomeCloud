import { importModule } from "../../utils";
import { platform } from "os";
import {
    RemoteAppInfo,
    RemoteAppWindowActionPayload,
} from "shared/types";
import { AppsDriver, H264FrameInfo, H264StreamResult } from "./driver";

interface AppsWinModule {
    getInstalledApps(): RemoteAppInfo[];
    getRunningApps(): RemoteAppInfo[];
    launchApp(appId: string): void;
    quitApp(appId: string): void;
    getAppIcon(appId: string): string | null;
    performAction(payload: RemoteAppWindowActionPayload): void;
    startH264Stream(
        callback: (err: Error | null, frame: H264FrameInfo) => void,
    ): H264StreamResult | null;
    stopH264Stream(): void;
    setStreamFps(fps: number): void;
    setStreamBitrate(bitrate: number): void;
    captureScreenshot(): string | null;
}

export class WinAppsDriver extends AppsDriver {
    private _module: AppsWinModule | null = null;

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
    performAction(payload: RemoteAppWindowActionPayload): void { this.native.performAction(payload); }

    // Full-screen streaming
    startH264ScreenStream(callback: (err: Error | null, frame: H264FrameInfo) => void): H264StreamResult | null {
        return this.native.startH264Stream(callback);
    }
    stopH264ScreenStream(): void { this.native.stopH264Stream(); }
    setScreenStreamFps(fps: number): void { this.native.setStreamFps(fps); }
    setScreenStreamBitrate(bitrate: number): void { this.native.setStreamBitrate(bitrate); }

    captureScreenshot(): string | null { return this.native.captureScreenshot(); }
}
