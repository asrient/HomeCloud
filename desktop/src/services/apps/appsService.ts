import { AppsService } from "shared/appsService";
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppState,
    RemoteAppWindowUIState,
    RemoteAppWindowActionPayload,
} from "shared/types";
import { serviceStartMethod, serviceStopMethod } from "shared/servicePrimatives";
import * as macDriver from "./macDriver";
import * as winDriver from "./winDriver";

const DEFAULT_TILE_SIZE = 64;
const DEFAULT_QUALITY = 0.6;

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";

function getDriver() {
    if (isMac) return macDriver;
    if (isWin) return winDriver;
    throw new Error("Apps service is not supported on this platform");
}

export default class DesktopAppsService extends AppsService {

    // ── App enumeration ──

    public async getInstalledApps(): Promise<RemoteAppInfo[]> {
        return getDriver().getInstalledApps();
    }

    public async getRunningApps(): Promise<RemoteAppInfo[]> {
        return getDriver().getRunningApps();
    }

    public async getAppState(appId: string): Promise<RemoteAppState> {
        return getDriver().getAppState(appId);
    }

    // ── App lifecycle ──

    public async launchApp(appId: string): Promise<void> {
        getDriver().launchApp(appId);
    }

    public async quitApp(appId: string): Promise<void> {
        getDriver().quitApp(appId);
    }

    public async getAppIcon(appId: string): Promise<string | null> {
        try {
            return getDriver().getAppIcon(appId);
        } catch {
            return null;
        }
    }

    // ── Window enumeration ──

    public async getWindows(appId?: string): Promise<RemoteAppWindow[]> {
        return getDriver().getWindows(appId);
    }

    // ── Window capture ──

    public async getWindowSnapshot(
        windowId: string,
        sinceTimestamp?: number,
        tileSize?: number,
        quality?: number,
    ): Promise<RemoteAppWindowUIState> {
        const driver = getDriver();
        // On Windows, windowId is a stringified HWND (uintptr_t), use parseInt for compat
        const numId = isMac ? parseInt(windowId, 10) : Number(windowId);
        return driver.captureWindow(
            numId,
            tileSize ?? DEFAULT_TILE_SIZE,
            quality ?? DEFAULT_QUALITY,
            sinceTimestamp ?? 0,
        );
    }

    // ── Window control ──

    public async performWindowAction(payload: RemoteAppWindowActionPayload): Promise<void> {
        getDriver().performAction(payload);
    }

    // ── Permissions ──

    public async hasScreenRecordingPermission(): Promise<boolean> {
        try {
            return getDriver().hasScreenRecordingPermission();
        } catch {
            return false;
        }
    }

    public async hasAccessibilityPermission(): Promise<boolean> {
        try {
            return getDriver().hasAccessibilityPermission();
        } catch {
            return false;
        }
    }

    public async requestScreenRecordingPermission(): Promise<void> {
        getDriver().requestScreenRecordingPermission();
    }

    public async requestAccessibilityPermission(): Promise<void> {
        getDriver().requestAccessibilityPermission();
    }

    @serviceStartMethod
    public async start() {
        console.log("AppsService started.");
    }

    @serviceStopMethod
    public async stop() {
        console.log("AppsService stopped.");
    }
}
