import { Service, exposed, serviceStartMethod, serviceStopMethod } from './servicePrimatives';
import {
    RemoteAppInfo,
    RemoteAppWindowActionPayload,
    StreamingSessionInfo,
} from './types';

export class ScreenService extends Service {
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

    // ── Screen control ──

    /**
     * Perform an action on the screen. Coordinates are screen-relative.
     */
    @exposed
    public async performAction(payload: RemoteAppWindowActionPayload): Promise<void> {
    }

    /** @deprecated Use performAction instead. Kept for backwards compatibility. */
    @exposed
    public async performWindowAction(payload: RemoteAppWindowActionPayload): Promise<void> {
        return this.performAction(payload);
    }

    // ── Screenshot ──

    /**
     * Take a screenshot of the screen.
     * @returns A base64-encoded PNG data URI string, or null if unavailable.
     */
    @exposed
    public async captureScreenshot(): Promise<string | null> {
        return null;
    }

    /** @deprecated Use captureScreenshot instead. Kept for backwards compatibility. */
    @exposed
    public async screenshotWindow(windowId?: string): Promise<string | null> {
        return this.captureScreenshot();
    }

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
