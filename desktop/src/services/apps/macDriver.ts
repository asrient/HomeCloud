import { importModule } from "../../utils";
import { platform } from "os";
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

interface AppsMacModule {
    getInstalledApps(): RemoteAppInfo[];
    getRunningApps(): RemoteAppInfo[];
    launchApp(bundleId: string): void;
    quitApp(bundleId: string): void;
    getAppIcon(bundleId: string): string | null;
    getWindows(bundleId?: string): RemoteAppWindow[];
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

let _module: AppsMacModule | null = null;

function getModule(): AppsMacModule {
    if (platform() !== "darwin") {
        throw new Error(`AppsMac module is not available on ${platform()}`);
    }
    if (!_module) {
        _module = importModule("AppsMac") as AppsMacModule;
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

// ── App lifecycle ──

export function launchApp(bundleId: string): void {
    getModule().launchApp(bundleId);
}

export function quitApp(bundleId: string): void {
    getModule().quitApp(bundleId);
}

export function getAppIcon(bundleId: string): string | null {
    return getModule().getAppIcon(bundleId);
}

// ── Window enumeration ──

export function getWindows(bundleId?: string): RemoteAppWindow[] {
    return getModule().getWindows(bundleId);
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
