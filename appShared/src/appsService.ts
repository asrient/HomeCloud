import { Service, exposed, serviceStartMethod, serviceStopMethod } from './servicePrimatives';
import Signal from './signals';
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppState,
    RemoteAppWindowTile,
    RemoteAppWindowUIState,
    RemoteAppWindowAction,
    RemoteAppWindowActionPayload,
} from './types';

export class AppsService extends Service {
    public init() {
        this._init();
    }

    /**
     * Check whether the apps/screen-control service is available on this device.
     * Returns false by default; desktop overrides to return true.
     */
    @exposed
    public async isAvailable(): Promise<boolean> {
        return false;
    }

    /**
     * Fired when the set of running apps changes (app launched or quit).
     * Payload is the updated list of running apps.
     */
    public runningAppsChanged = new Signal<[RemoteAppInfo[]]>({ isExposed: true, isAllowAll: false });

    /**
     * Fired when the set of windows for a given app changes (window opened or closed).
     * Payload is [appId, updatedWindowsList].
     */
    public windowsChanged = new Signal<[string, RemoteAppWindow[]]>({ isExposed: true, isAllowAll: false });

    // ── App enumeration ──

    /**
     * List all installed applications on this device.
     */
    @exposed
    public async getInstalledApps(force?: boolean): Promise<RemoteAppInfo[]> {
        return [];
    }

    /**
     * List all currently running applications with visible windows.
     */
    @exposed
    public async getRunningApps(): Promise<RemoteAppInfo[]> {
        return [];
    }

    /**
     * Get the current state of an app by its bundle/app ID.
     */
    @exposed
    public async getAppState(appId: string): Promise<RemoteAppState> {
        return { isRunning: false, isFocused: false };
    }

    // ── App lifecycle ──

    /**
     * Launch an installed application by its bundle/app ID.
     */
    @exposed
    public async launchApp(appId: string): Promise<void> {
    }

    /**
     * Quit a running application by its bundle/app ID.
     */
    @exposed
    public async quitApp(appId: string): Promise<void> {
    }

    /**
     * Get the icon for an application as a base64-encoded PNG data URI.
     * @param appId The bundle/app ID of the application.
     * @returns A data URI string (data:image/png;base64,...) or null if unavailable.
     */
    @exposed
    public async getAppIcon(appId: string): Promise<string | null> {
        return null;
    }

    // ── Window enumeration ──

    /**
     * List all visible windows across all apps (or for a specific app).
     */
    @exposed
    public async getWindows(appId?: string): Promise<RemoteAppWindow[]> {
        return [];
    }

    /**
     * Start watching running apps changes.
     * The server will poll and dispatch runningAppsChanged signals.
     */
    @exposed
    public async watchRunningApps(): Promise<void> {
    }

    /**
     * Stop watching running apps changes.
     */
    @exposed
    public async unwatchRunningApps(): Promise<void> {
    }

    /**
     * Start watching window changes for a given app.
     * The server will poll and dispatch windowsChanged signals.
     */
    @exposed
    public async watchWindows(appId: string): Promise<void> {
    }

    /**
     * Stop watching window changes for a given app.
     */
    @exposed
    public async unwatchWindows(appId: string): Promise<void> {
    }

    // ── Window capture ──

    /**
     * Get the full UI state (position, size, and tile snapshot) of a window.
     * Uses tile-based diffing: on the first call returns all tiles; subsequent
     * calls return only changed tiles since the given timestamp.
     * @param windowId The CGWindowID of the target window.
     * @param sinceTimestamp Optional. If provided, only tiles that changed after
     *                       this timestamp are returned (delta mode).
     * @param tileSize Optional tile size in px (default 64).
     * @param quality Optional JPEG quality 0-1 (default 0.6).
     */
    @exposed
    public async getWindowSnapshot(
        windowId: string,
        sinceTimestamp?: number,
        tileSize?: number,
        quality?: number,
    ): Promise<RemoteAppWindowUIState> {
        return { x: 0, y: 0, width: 0, height: 0, tiles: [] };
    }

    // ── Window control ──

    /**
     * Perform an action on a window (focus, minimize, maximize, close, click, etc.).
     */
    @exposed
    public async performWindowAction(payload: RemoteAppWindowActionPayload): Promise<void> {
    }

    // ── Permissions ──

    /**
     * Check whether screen recording permission has been granted.
     */
    @exposed
    public async hasScreenRecordingPermission(): Promise<boolean> {
        return false;
    }

    /**
     * Check whether accessibility permission has been granted.
     */
    @exposed
    public async hasAccessibilityPermission(): Promise<boolean> {
        return false;
    }

    /**
     * Request/prompt the user to grant screen recording permission.
     */
    @exposed
    public async requestScreenRecordingPermission(): Promise<void> {
    }

    /**
     * Request/prompt the user to grant accessibility permission.
     */
    @exposed
    public async requestAccessibilityPermission(): Promise<void> {
    }

    @serviceStartMethod
    public async start() { }

    @serviceStopMethod
    public async stop() { }
}
