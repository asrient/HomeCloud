import { importModule } from "../../utils";
import { platform } from "os";
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppState,
    RemoteAppWindowUIState,
    RemoteAppWindowActionPayload,
} from "shared/types";

// Type declarations for the native module — mirrors macDriver but for Windows
interface AppsWinModule {
    getInstalledApps(): RemoteAppInfo[];
    getRunningApps(): RemoteAppInfo[];
    getAppState(appId: string): RemoteAppState;
    launchApp(appId: string): void;
    quitApp(appId: string): void;
    getAppIcon(appId: string): string | null;
    getWindows(appId?: string): RemoteAppWindow[];
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
            else {
                // Convert binary JPEG buffers to base64 strings for RPC transport
                for (const tile of result.tiles) {
                    if (Buffer.isBuffer(tile.image)) {
                        tile.image = (tile.image as unknown as Buffer).toString('base64');
                    }
                }
                resolve(result);
            }
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

// ── Permissions (always true on Windows) ──

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
