import { Service, exposed, serviceStartMethod, serviceStopMethod } from './servicePrimatives';
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppState,
    RemoteAppWindowTile,
    RemoteAppWindowUIState,
    RemoteAppWindowAction,
    RemoteAppWindowActionPayload,
} from './types';

export abstract class AppsService extends Service {
    public init() {
        this._init();
    }

    // ── App enumeration ──

    /**
     * List all installed applications on this device.
     */
    @exposed
    public async getInstalledApps(): Promise<RemoteAppInfo[]> {
        throw new Error("Not implemented");
    }

    /**
     * List all currently running applications with visible windows.
     */
    @exposed
    public async getRunningApps(): Promise<RemoteAppInfo[]> {
        throw new Error("Not implemented");
    }

    /**
     * Get the current state of an app by its bundle/app ID.
     */
    @exposed
    public async getAppState(appId: string): Promise<RemoteAppState> {
        throw new Error("Not implemented");
    }

    // ── App lifecycle ──

    /**
     * Launch an installed application by its bundle/app ID.
     */
    @exposed
    public async launchApp(appId: string): Promise<void> {
        throw new Error("Not implemented");
    }

    /**
     * Quit a running application by its bundle/app ID.
     */
    @exposed
    public async quitApp(appId: string): Promise<void> {
        throw new Error("Not implemented");
    }

    /**
     * Get the icon for an application as a base64-encoded PNG data URI.
     * @param appId The bundle/app ID of the application.
     * @returns A data URI string (data:image/png;base64,...) or null if unavailable.
     */
    @exposed
    public async getAppIcon(appId: string): Promise<string | null> {
        throw new Error("Not implemented");
    }

    // ── Window enumeration ──

    /**
     * List all visible windows across all apps (or for a specific app).
     */
    @exposed
    public async getWindows(appId?: string): Promise<RemoteAppWindow[]> {
        throw new Error("Not implemented");
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
        throw new Error("Not implemented");
    }

    // ── Window control ──

    /**
     * Perform an action on a window (focus, minimize, maximize, close, click, etc.).
     */
    @exposed
    public async performWindowAction(payload: RemoteAppWindowActionPayload): Promise<void> {
        throw new Error("Not implemented");
    }

    // ── Permissions ──

    /**
     * Check whether screen recording permission has been granted.
     */
    @exposed
    public async hasScreenRecordingPermission(): Promise<boolean> {
        throw new Error("Not implemented");
    }

    /**
     * Check whether accessibility permission has been granted.
     */
    @exposed
    public async hasAccessibilityPermission(): Promise<boolean> {
        throw new Error("Not implemented");
    }

    /**
     * Request/prompt the user to grant screen recording permission.
     */
    @exposed
    public async requestScreenRecordingPermission(): Promise<void> {
        throw new Error("Not implemented");
    }

    /**
     * Request/prompt the user to grant accessibility permission.
     */
    @exposed
    public async requestAccessibilityPermission(): Promise<void> {
        throw new Error("Not implemented");
    }

    @serviceStartMethod
    public async start() { }

    @serviceStopMethod
    public async stop() { }
}
