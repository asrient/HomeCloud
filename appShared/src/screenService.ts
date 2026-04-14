import { Service, exposed, info, input, output, serviceStartMethod, serviceStopMethod, wfApi } from './servicePrimatives';
import {
    Sch,
    RemoteAppInfo,
    RemoteAppInfoSchema,
    RemoteAppWindowActionPayload,
    RemoteAppWindowActionPayloadSchema,
    StreamingSessionInfo,
    StreamingSessionInfoSchema,
} from './types';

export class ScreenService extends Service {
    static serviceDescription = 'Screen capture, remote control, app management, and live streaming.';

    public init() {
        this._init();
    }

    // --- Exposed methods (final — do not override) ---

    @exposed @info("Check if screen control features are available")
    @output(Sch.Boolean)
    public async isAvailable(): Promise<boolean> { return this._isAvailable(); }

    @exposed @info("List installed applications")
    @wfApi
    @input(Sch.Name('force', Sch.Optional(Sch.Boolean)))
    @output(Sch.Array(RemoteAppInfoSchema))
    public async getInstalledApps(force?: boolean): Promise<RemoteAppInfo[]> { return this._getInstalledApps(force); }
    
    @exposed @info("List currently running applications")
    @wfApi
    @output(Sch.Array(RemoteAppInfoSchema))
    public async getRunningApps(): Promise<RemoteAppInfo[]> { return this._getRunningApps(); }
    
    @exposed @info("Launch an application by ID")
    @wfApi
    @input(Sch.Name('appId', Sch.String))
    public async launchApp(appId: string): Promise<void> { return this._launchApp(appId); }
    
    @exposed @info("Quit a running application by ID")
    @wfApi
    @input(Sch.Name('appId', Sch.String))
    public async quitApp(appId: string): Promise<void> { return this._quitApp(appId); }
    
    @exposed @info("Get an application's icon as base64")
    @input(Sch.Name('appId', Sch.String))
    @output(Sch.NullableString)
    public async getAppIcon(appId: string): Promise<string | null> { return this._getAppIcon(appId); }
    
    @exposed @info("Perform an UI action on the screen")
    @wfApi
    @input(Sch.Name('payload', RemoteAppWindowActionPayloadSchema))
    public async performAction(payload: RemoteAppWindowActionPayload): Promise<void> { return this._performAction(payload); }
    
    @exposed @info("Capture a screenshot of the entire screen")
    @wfApi
    @output(Sch.NullableString)
    public async captureScreenshot(): Promise<string | null> { return this._captureScreenshot(); }
    
    @exposed @info("Start a live screen streaming session")
    @output(StreamingSessionInfoSchema)
    public async startStreamingSession(): Promise<StreamingSessionInfo> { return this._startStreamingSession(); }
    
    @exposed @info("Stop the current screen streaming session")
    public async stopStreamingSession(): Promise<void> { return this._stopStreamingSession(); }
    
    @exposed @info("Adjust streaming FPS and quality")
    @input(Sch.Name('fps', Sch.Optional(Sch.Number)), Sch.Name('quality', Sch.Optional(Sch.Number)))
    public async streamControl(fps?: number, quality?: number): Promise<void> { return this._streamControl(fps, quality); }
    
    @exposed @info("Check if screen recording permission is granted")
    @output(Sch.Boolean)
    public async hasScreenRecordingPermission(): Promise<boolean> { return this._hasScreenRecordingPermission(); }
    
    @exposed @info("Check if accessibility permission is granted")
    @output(Sch.Boolean)
    public async hasAccessibilityPermission(): Promise<boolean> { return this._hasAccessibilityPermission(); }
    
    @exposed @info("Request screen recording permission from the OS")
    public async requestScreenRecordingPermission(): Promise<void> { return this._requestScreenRecordingPermission(); }
    
    @exposed @info("Request accessibility permission from the OS")
    public async requestAccessibilityPermission(): Promise<void> { return this._requestAccessibilityPermission(); }

    // --- Protected methods (override these in subclasses) ---

    protected async _isAvailable(): Promise<boolean> { return false; }
    protected async _getInstalledApps(force?: boolean): Promise<RemoteAppInfo[]> { return []; }
    protected async _getRunningApps(): Promise<RemoteAppInfo[]> { return []; }
    protected async _launchApp(appId: string): Promise<void> { }
    protected async _quitApp(appId: string): Promise<void> { }
    protected async _getAppIcon(appId: string): Promise<string | null> { return null; }
    protected async _performAction(payload: RemoteAppWindowActionPayload): Promise<void> { }
    protected async _captureScreenshot(): Promise<string | null> { return null; }
    protected async _startStreamingSession(): Promise<StreamingSessionInfo> { throw new Error('Streaming is not supported on this device'); }
    protected async _stopStreamingSession(): Promise<void> { }
    protected async _streamControl(fps?: number, quality?: number): Promise<void> { }
    protected async _hasScreenRecordingPermission(): Promise<boolean> { return false; }
    protected async _hasAccessibilityPermission(): Promise<boolean> { return false; }
    protected async _requestScreenRecordingPermission(): Promise<void> { }
    protected async _requestAccessibilityPermission(): Promise<void> { }

    @serviceStartMethod
    public async start() { }

    @serviceStopMethod
    public async stop() { }
}
