import { AppsService } from "shared/appsService";
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppState,
    RemoteAppWindowUIState,
    RemoteAppWindowActionPayload,
} from "shared/types";
import { serviceStartMethod, serviceStopMethod, exposed } from "shared/servicePrimatives";
import * as macDriver from "./macDriver";
import * as winDriver from "./winDriver";
import { powerSaveBlocker } from "electron";

const DEFAULT_TILE_SIZE = 64;
const DEFAULT_QUALITY = 0.6;
const POLL_INTERVAL = 5_000;       // 5 seconds
const POLL_IDLE_TIMEOUT = 180_000; // 3 minutes
const WINDOW_POLL_INTERVAL = 3_000; // 3 seconds
const WINDOW_POLL_IDLE_TIMEOUT = 180_000; // 3 minutes

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";

function getDriver() {
    if (isMac) return macDriver;
    if (isWin) return winDriver;
    throw new Error("Apps service is not supported on this platform");
}

export default class DesktopAppsService extends AppsService {

    private installedAppsCache: RemoteAppInfo[] | null = null;
    private runningAppsIds: Set<string> | null = null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private lastRunningAppsCall = 0;

    // Per-app window tracking
    private windowWatchers = new Map<string, {
        timer: ReturnType<typeof setInterval>;
        windowIds: Set<string>;
        lastAccess: number;
    }>();

    // Prevent display sleep/lock during active capture sessions
    private powerBlockerId: number | null = null;
    private lastCaptureTime = 0;
    private powerBlockerTimer: ReturnType<typeof setInterval> | null = null;
    private static readonly POWER_BLOCKER_TIMEOUT = 10_000; // Release after 10s of no captures

    @exposed
    public override async isAvailable(): Promise<boolean> {
        return true;
    }

    // ── App enumeration ──

    @exposed
    public async getInstalledApps(force?: boolean): Promise<RemoteAppInfo[]> {
        if (!force && this.installedAppsCache) return this.installedAppsCache;
        this.installedAppsCache = getDriver().getInstalledApps();
        return this.installedAppsCache;
    }

    @exposed
    public async getRunningApps(): Promise<RemoteAppInfo[]> {
        return getDriver().getRunningApps();
    }

    /**
     * Start watching running apps changes.
     * Polls every 5s and dispatches runningAppsChanged when apps open/close.
     * Auto-stops after 3 min of inactivity.
     */
    @exposed
    public async watchRunningApps(): Promise<void> {
        this.lastRunningAppsCall = Date.now();
        if (this.pollTimer) return;
        this.runningAppsIds = new Set(getDriver().getRunningApps().map(a => a.id));
        this.pollTimer = setInterval(() => this.pollRunningApps(), POLL_INTERVAL);
    }

    @exposed
    public async unwatchRunningApps(): Promise<void> {
        this.stopPolling();
    }

    private stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.runningAppsIds = null;
    }

    private pollRunningApps() {
        if (Date.now() - this.lastRunningAppsCall > POLL_IDLE_TIMEOUT) {
            this.stopPolling();
            return;
        }
        const apps = getDriver().getRunningApps();
        const currentIds = new Set(apps.map(a => a.id));
        if (this.runningAppsIds) {
            const changed =
                currentIds.size !== this.runningAppsIds.size ||
                [...currentIds].some(id => !this.runningAppsIds!.has(id));
            if (changed) {
                this.runningAppsChanged.dispatch(apps);
            }
        }
        this.runningAppsIds = currentIds;
    }

    @exposed
    public async getAppState(appId: string): Promise<RemoteAppState> {
        return getDriver().getAppState(appId);
    }

    // ── App lifecycle ──

    @exposed
    public async launchApp(appId: string): Promise<void> {
        getDriver().launchApp(appId);
    }

    @exposed
    public async quitApp(appId: string): Promise<void> {
        getDriver().quitApp(appId);
    }

    @exposed
    public async getAppIcon(appId: string): Promise<string | null> {
        try {
            return getDriver().getAppIcon(appId);
        } catch {
            return null;
        }
    }

    // ── Window enumeration ──

    @exposed
    public async getWindows(appId?: string): Promise<RemoteAppWindow[]> {
        return getDriver().getWindows(appId);
    }

    /**
     * Start watching window changes for a given app.
     * Polls every 3s and dispatches windowsChanged when windows open/close.
     * Auto-stops after 3 min of inactivity.
     */
    @exposed
    public async watchWindows(appId: string): Promise<void> {
        const existing = this.windowWatchers.get(appId);
        if (existing) {
            existing.lastAccess = Date.now();
            return;
        }
        const windows = getDriver().getWindows(appId);
        const windowIds = new Set(windows.map(w => w.id));
        const timer = setInterval(() => this.pollWindows(appId), WINDOW_POLL_INTERVAL);
        this.windowWatchers.set(appId, { timer, windowIds, lastAccess: Date.now() });
    }

    @exposed
    public async unwatchWindows(appId: string): Promise<void> {
        this.stopWindowWatcher(appId);
    }

    private stopWindowWatcher(appId: string) {
        const watcher = this.windowWatchers.get(appId);
        if (watcher) {
            clearInterval(watcher.timer);
            this.windowWatchers.delete(appId);
        }
    }

    private pollWindows(appId: string) {
        const watcher = this.windowWatchers.get(appId);
        if (!watcher) return;
        if (Date.now() - watcher.lastAccess > WINDOW_POLL_IDLE_TIMEOUT) {
            this.stopWindowWatcher(appId);
            return;
        }
        const windows = getDriver().getWindows(appId);
        const currentIds = new Set(windows.map(w => w.id));
        const changed =
            currentIds.size !== watcher.windowIds.size ||
            [...currentIds].some(id => !watcher.windowIds.has(id));
        if (changed) {
            watcher.windowIds = currentIds;
            this.windowsChanged.dispatch(appId, windows);
        }
    }

    // ── Window capture ──

    private startPowerBlocker() {
        if (this.powerBlockerId !== null && powerSaveBlocker.isStarted(this.powerBlockerId)) return;
        this.powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
        console.log('PowerSaveBlocker started (prevent-display-sleep) id:', this.powerBlockerId);

        // Start a timer to auto-release if captures stop
        if (!this.powerBlockerTimer) {
            this.powerBlockerTimer = setInterval(() => {
                if (Date.now() - this.lastCaptureTime > DesktopAppsService.POWER_BLOCKER_TIMEOUT) {
                    this.stopPowerBlocker();
                }
            }, 10_000);
        }
    }

    private stopPowerBlocker() {
        if (this.powerBlockerTimer) {
            clearInterval(this.powerBlockerTimer);
            this.powerBlockerTimer = null;
        }
        if (this.powerBlockerId !== null && powerSaveBlocker.isStarted(this.powerBlockerId)) {
            powerSaveBlocker.stop(this.powerBlockerId);
            console.log('PowerSaveBlocker stopped, id:', this.powerBlockerId);
        }
        this.powerBlockerId = null;
    }

    @exposed
    public async getWindowSnapshot(
        windowId: string,
        sinceTimestamp?: number,
        tileSize?: number,
        quality?: number,
    ): Promise<RemoteAppWindowUIState> {
        this.lastCaptureTime = Date.now();
        this.startPowerBlocker();

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

    @exposed
    public async performWindowAction(payload: RemoteAppWindowActionPayload): Promise<void> {
        getDriver().performAction(payload);
    }

    // ── Permissions ──

    @exposed
    public async hasScreenRecordingPermission(): Promise<boolean> {
        try {
            return getDriver().hasScreenRecordingPermission();
        } catch {
            return false;
        }
    }

    @exposed
    public async hasAccessibilityPermission(): Promise<boolean> {
        try {
            return getDriver().hasAccessibilityPermission();
        } catch {
            return false;
        }
    }

    @exposed
    public async requestScreenRecordingPermission(): Promise<void> {
        getDriver().requestScreenRecordingPermission();
    }

    @exposed
    public async requestAccessibilityPermission(): Promise<void> {
        getDriver().requestAccessibilityPermission();
    }

    @serviceStartMethod
    public async start() {
        console.log("AppsService started.");
    }

    @serviceStopMethod
    public async stop() {
        this.stopPolling();
        this.stopPowerBlocker();
        for (const appId of this.windowWatchers.keys()) {
            this.stopWindowWatcher(appId);
        }
        console.log("AppsService stopped.");
    }
}
