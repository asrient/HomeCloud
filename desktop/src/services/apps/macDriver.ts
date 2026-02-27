import { importModule } from "../../utils";
import { platform } from "os";
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppState,
    RemoteAppWindowUIState,
    RemoteAppWindowActionPayload,
} from "shared/types";

// Type declarations for the native module
interface AppsMacModule {
    getInstalledApps(): RemoteAppInfo[];
    getRunningApps(): RemoteAppInfo[];
    getAppState(bundleId: string): RemoteAppState;
    launchApp(bundleId: string): void;
    quitApp(bundleId: string): void;
    getAppIcon(bundleId: string): string | null;
    getWindows(bundleId?: string): RemoteAppWindow[];
    captureWindow(
        windowId: number,
        tileSize: number,
        quality: number,
        sinceTimestamp: number,
        callback: (err: Error | null, result: RemoteAppWindowUIState) => void,
    ): void;
    performAction(payload: RemoteAppWindowActionPayload): void;
    clearWindowCache(windowId: number): void;
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

export function getAppState(bundleId: string): RemoteAppState {
    return getModule().getAppState(bundleId);
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

// ── Window capture ──

export function captureWindow(
    windowId: number,
    tileSize: number,
    quality: number,
    sinceTimestamp: number,
): Promise<RemoteAppWindowUIState> {
    return new Promise((resolve, reject) => {
        getModule().captureWindow(windowId, tileSize, quality, sinceTimestamp, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

// ── Actions ──

export function performAction(payload: RemoteAppWindowActionPayload): void {
    getModule().performAction(payload);
}

// ── Cache management ──

export function clearWindowCache(windowId: number): void {
    getModule().clearWindowCache(windowId);
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
