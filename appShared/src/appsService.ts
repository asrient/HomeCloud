import { Service, exposed, serviceStartMethod, serviceStopMethod } from './servicePrimatives';
import Signal from './signals';
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppWindowAction,
    RemoteAppWindowActionPayload,
    StreamingSessionInfo,
    WindowEvent,
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

    /**
     * Fired when a window is created.
     * Payload is { app, window }.
     */
    public windowCreated = new Signal<[WindowEvent]>({ isExposed: true, isAllowAll: false });

    /**
     * Fired when a window is destroyed.
     * Payload is { app, window }.
     */
    public windowDestroyed = new Signal<[WindowEvent]>({ isExposed: true, isAllowAll: false });

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

    /**
     * Heartbeat-based window watching. Client calls every ~1 min.
     * Server starts delivering windowCreated/windowDestroyed signals.
     * If no heartbeat received for 3 min, server stops watching.
     */
    @exposed
    public async watchWindowsHeartbeat(): Promise<void> {
    }

    // ── Window streaming ──

    /**
     * Start an H.264 video stream for a window. Returns a ReadableStream of
     * HCMediaStream chunks (binary: metadata + H.264 NAL units) along with
     * initial frame dimensions and pixel density. Only one session per window
     * is allowed — starting a new session invalidates the previous one.
     * @param windowId The window to stream.
     */
    @exposed
    public async startStreamingSession(windowId: string): Promise<StreamingSessionInfo> {
        throw new Error('Streaming is not supported on this device');
    }

    /**
     * Stop a streaming session for a window.
     * May not always be called (e.g. client disconnect); the session is
     * automatically cleaned up on inactivity or when a new session starts.
     */
    @exposed
    public async stopStreamingSession(windowId: string): Promise<void> {
    }

    /**
     * Stream control + heartbeat. Call every ~3s to keep the stream alive.
     * Optionally pass fps/quality to adjust the stream on the fly.
     * If not received for ~8s the server closes the stream.
     * @param windowId The window being streamed.
     * @param fps Optional target frames per second.
     * @param quality Optional 0.0-1.0 quality (maps to bitrate).
     */
    @exposed
    public async streamControl(windowId: string, fps?: number, quality?: number): Promise<void> {
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
