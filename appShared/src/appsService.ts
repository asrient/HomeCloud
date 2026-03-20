import { Service, exposed, serviceStartMethod, serviceStopMethod } from './servicePrimatives';
import Signal from './signals';
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppWindowAction,
    RemoteAppWindowActionPayload,
    StreamingSessionInfo,
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
     * Fired when an app is launched.
     * Payload is the launched app info.
     */
    public appLaunched = new Signal<[RemoteAppInfo]>({ isExposed: true, isAllowAll: false });

    /**
     * Fired when an app quits.
     * Payload is the quit app info.
     */
    public appQuit = new Signal<[RemoteAppInfo]>({ isExposed: true, isAllowAll: false });

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

    // ── Full-screen streaming ──

    /**
     * Start an H.264 video stream of the entire screen. Returns a ReadableStream of
     * HCMediaStream chunks (binary: metadata + H.264 NAL units) along with
     * initial screen dimensions and pixel density. Only one session is allowed at
     * a time — starting a new session invalidates the previous one.
     */
    @exposed
    public async startStreamingSession(): Promise<StreamingSessionInfo> {
        throw new Error('Streaming is not supported on this device');
    }

    /**
     * Stop the active streaming session.
     * May not always be called (e.g. client disconnect); the session is
     * automatically cleaned up on inactivity or when a new session starts.
     */
    @exposed
    public async stopStreamingSession(): Promise<void> {
    }

    /**
     * Stream control + heartbeat. Call every ~3s to keep the stream alive.
     * Optionally pass fps/quality to adjust the stream on the fly.
     * If not received for ~8s the server closes the stream.
     * @param fps Optional target frames per second.
     * @param quality Optional 0.0-1.0 quality (maps to bitrate).
     */
    @exposed
    public async streamControl(fps?: number, quality?: number): Promise<void> {
    }

    // ── Screen / window control ──

    /**
     * Perform an action on a window or the screen. Coordinates are screen-relative.
     * If windowId is provided, the action targets that specific window.
     * If windowId is omitted, the action targets the screen (e.g. click at screen coords).
     */
    @exposed
    public async performWindowAction(payload: RemoteAppWindowActionPayload): Promise<void> {
    }

    // ── Screenshot ──

    /**
     * Take a screenshot of a specific window by its window ID.
     * @param windowId The ID of the window to screenshot.
     * @returns A base64-encoded PNG data URI string, or null if unavailable.
     */
    @exposed
    public async screenshotWindow(windowId: string): Promise<string | null> {
        return null;
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
