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

    // ── App watching ──

    abstract watchRunningApps(
        onLaunch: (app: RemoteAppInfo) => void,
        onQuit: (app: RemoteAppInfo) => void,
    ): void;
    abstract unwatchRunningApps(): void;

    // ── Window watching ──

    abstract startWindowWatching(
        onCreated: (app: RemoteAppInfo, win: RemoteAppWindow) => void,
        onDestroyed: (app: RemoteAppInfo, win: RemoteAppWindow) => void,
    ): void;
    abstract stopWindowWatching(): void;

    // ── Window actions ──

    abstract performAction(payload: RemoteAppWindowActionPayload): void;

    // ── H.264 streaming ──

    abstract startH264Stream(
        windowId: number,
        callback: (err: Error | null, frame: H264FrameInfo) => void,
    ): H264StreamResult | null;
    abstract stopH264Stream(windowId: number): void;
    abstract setStreamFps(windowId: number, fps: number): void;
    abstract setStreamBitrate(windowId: number, bitrate: number): void;

    // ── Permissions (defaults: always granted) ──

    hasScreenRecordingPermission(): boolean { return true; }
    hasAccessibilityPermission(): boolean { return true; }
    requestScreenRecordingPermission(): void {}
    requestAccessibilityPermission(): void {}
}
