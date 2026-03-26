import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppWindowActionPayload,
} from "shared/types";

export interface H264FrameInfo {
    data: Buffer;
    isKeyframe: boolean;
    width: number;
    height: number;
    dpi: number;
    isFirst: boolean;
    timestamp: number;
}

export interface H264StreamResult {
    width: number;
    height: number;
    dpi: number;
}

export abstract class AppsDriver {

    // ── App enumeration ──

    abstract getInstalledApps(): RemoteAppInfo[];
    abstract getRunningApps(): RemoteAppInfo[];
    abstract launchApp(appId: string): void;
    abstract quitApp(appId: string): void;
    abstract getAppIcon(appId: string): string | null;

    // ── Window enumeration ──

    abstract getWindows(appId?: string): RemoteAppWindow[];

    // ── Screen / window actions ──

    abstract performAction(payload: RemoteAppWindowActionPayload): void;

    // ── Full-screen H.264 streaming ──

    abstract startH264ScreenStream(
        callback: (err: Error | null, frame: H264FrameInfo) => void,
    ): H264StreamResult | null;
    abstract stopH264ScreenStream(): void;
    abstract setScreenStreamFps(fps: number): void;
    abstract setScreenStreamBitrate(bitrate: number): void;

    // ── Screenshot ──

    abstract screenshotWindow(windowId: number): string | null;

    // ── Permissions (defaults: always granted) ──

    hasScreenRecordingPermission(): boolean { return true; }
    hasAccessibilityPermission(): boolean { return true; }
    requestScreenRecordingPermission(): void {}
    requestAccessibilityPermission(): void {}
}
