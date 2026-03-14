import { importModule } from "../../utils";
import { platform } from "os";
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppState,
    RemoteAppWindowActionPayload,
} from "shared/types";
import type { H264FrameInfo, H264StreamResult } from "./macDriver";

interface AppsWinModule {
    getInstalledApps(): RemoteAppInfo[];
    getRunningApps(): RemoteAppInfo[];
    getAppState(appId: string): RemoteAppState;
    launchApp(appId: string): void;
    quitApp(appId: string): void;
    getAppIcon(appId: string): string | null;
    getWindows(appId?: string): RemoteAppWindow[];
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

let _module: AppsWinModule | null = null;

function getModule(): AppsWinModule {
    if (platform() !== "win32") {
        throw new Error(`AppsWin module is not available on ${platform()}`);
    }
    if (!_module) {
        _module = importModule("AppsWin") as AppsWinModule;
    }
    return _module;
}

// ── App enumeration ──

export function getInstalledApps(): RemoteAppInfo[] {
    return getModule().getInstalledApps();
}

export function getRunningApps(): RemoteAppInfo[] {
    return getModule().getRunningApps();
}

export function getAppState(appId: string): RemoteAppState {
    return getModule().getAppState(appId);
}

// ── App lifecycle ──

export function launchApp(appId: string): void {
    getModule().launchApp(appId);
}

export function quitApp(appId: string): void {
    getModule().quitApp(appId);
}

export function getAppIcon(appId: string): string | null {
    return getModule().getAppIcon(appId);
}

// ── Window enumeration ──

export function getWindows(appId?: string): RemoteAppWindow[] {
    return getModule().getWindows(appId);
}

// ── Actions ──

export function performAction(payload: RemoteAppWindowActionPayload): void {
    getModule().performAction(payload);
}

// ── H.264 streaming ──

export function startH264Stream(
    windowId: number,
    callback: (err: Error | null, frame: H264FrameInfo) => void,
): H264StreamResult | null {
    return getModule().startH264Stream(windowId, callback);
}

export function stopH264Stream(windowId: number): void {
    getModule().stopH264Stream(windowId);
}

export function setStreamFps(windowId: number, fps: number): void {
    getModule().setStreamFps(windowId, fps);
}

export function setStreamBitrate(windowId: number, bitrate: number): void {
    getModule().setStreamBitrate(windowId, bitrate);
}

// ── Permissions ──

export function hasScreenRecordingPermission(): boolean {
    return getModule().hasScreenRecordingPermission();
}

export function hasAccessibilityPermission(): boolean {
    return getModule().hasAccessibilityPermission();
}

export function requestScreenRecordingPermission(): void {
    getModule().requestScreenRecordingPermission();
}

export function requestAccessibilityPermission(): void {
    getModule().requestAccessibilityPermission();
}
