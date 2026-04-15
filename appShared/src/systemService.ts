import { Service, serviceStartMethod, serviceStopMethod, exposed, info, input, output, assertServiceRunning, wfApi } from "./servicePrimatives";
import { Sch, DeviceInfo, DeviceInfoSchema, NativeAskConfig, NativeAsk, DefaultDirectories, AudioPlaybackInfo, BatteryInfo, BatteryInfoSchema, Disk, DiskSchema, ClipboardContent, ClipboardContentType, ClipboardFile, ScreenLockStatus, AudioPlaybackInfoSchema } from "./types";
import Signal from "./signals";


export abstract class SystemService extends Service {
    static serviceDescription = 'Device info, audio playback, volume, clipboard, battery, screen lock, and disk management.';

    public init() {
        this._init();
    }

    public abstract getDeviceInfo(): Promise<DeviceInfo>;
    public abstract getDefaultDirectories(): Promise<DefaultDirectories>;

    public abstract alert(title: string, description?: string): void;

    public abstract ask(config: NativeAskConfig): NativeAsk;

    public abstract copyToClipboard(content: string | ClipboardFile[], type?: ClipboardContentType): void;

    public abstract share(options: { title?: string; description?: string; content?: string; files?: string[], type: 'url' | 'text' | 'file' }): Promise<void>;

    // --- Exposed methods (final — do not override) ---

    @exposed @info("Check if audio playback control is supported")
    @output(Sch.Boolean)
    public async canControlAudioPlayback(): Promise<boolean> { return this._canControlAudioPlayback(); }

    @exposed @info("Check if volume level control is supported")
    @output(Sch.Boolean)
    public async canControlVolumeLevel(): Promise<boolean> { return this._canControlVolumeLevel(); }

    @exposed @info("Get current audio playback info (track, artist, album art)")
    @wfApi
    @output(Sch.Nullable(AudioPlaybackInfoSchema))
    public async getAudioPlaybackInfo(): Promise<AudioPlaybackInfo | null> { return this._getAudioPlaybackInfo(); }

    public audioPlaybackSignal = new Signal<[AudioPlaybackInfo | null]>({ isExposed: true, isAllowAll: false });

    @exposed @info("Pause audio playback")
    @wfApi
    public async pauseAudioPlayback(): Promise<void> { return this._pauseAudioPlayback(); }

    @exposed @info("Resume audio playback")
    @wfApi
    public async playAudioPlayback(): Promise<void> { return this._playAudioPlayback(); }

    @exposed @info("Skip to next audio track")
    @wfApi
    public async nextAudioTrack(): Promise<void> { return this._nextAudioTrack(); }

    @exposed @info("Go to previous audio track")
    @wfApi
    public async previousAudioTrack(): Promise<void> { return this._previousAudioTrack(); }

    @exposed @info("Get current volume level (0-1)")
    @wfApi
    @output(Sch.Number)
    public async getVolumeLevel(): Promise<number> { return this._getVolumeLevel(); }

    @exposed @info("Set volume level (0-1)")
    @wfApi
    @input(Sch.Name('level', { type: 'number', minimum: 0, maximum: 1 }))
    public async setVolumeLevel(level: number): Promise<void> { return this._setVolumeLevel(level); }

    @exposed @info("Get battery level and charging status")
    @wfApi
    @output(BatteryInfoSchema)
    public async getBatteryInfo(): Promise<BatteryInfo> { return this._getBatteryInfo(); }

    @exposed @info("Check if battery info is available")
    @output(Sch.Boolean)
    public async canGetBatteryInfo(): Promise<boolean> { return this._canGetBatteryInfo(); }

    public batteryInfoSignal = new Signal<[BatteryInfo]>({ isExposed: true, isAllowAll: false });

    public getAccentColorHex(): string {
        return "0078D4";
    }

    public accentColorChangeSignal = new Signal<[string]>();

    @exposed @info("Open a URL in the default browser")
    @wfApi
    @input(Sch.Name('url', Sch.String))
    public async openUrl(url: string) { return this._openUrl(url); }

    @exposed @info("Open a file with the default application")
    @wfApi
    @input(Sch.Name('filePath', Sch.String))
    public async openFile(filePath: string) { return this._openFile(filePath); }

    @exposed @info("Lock the device screen")
    @wfApi
    public async lockScreen(): Promise<void> { return this._lockScreen(); }

    @exposed @info("Get screen lock status (locked/unlocked/not-supported)")
    @wfApi
    @output(Sch.Enum('locked', 'unlocked', 'not-supported'))
    public async getScreenLockStatus(): Promise<ScreenLockStatus> { return this._getScreenLockStatus(); }

    public screenLockSignal = new Signal<[ScreenLockStatus]>({ isExposed: true, isAllowAll: false });

    @exposed @info("Get device information (OS, model, form factor)")
    @wfApi
    @output(DeviceInfoSchema)
    public async deviceInfo(): Promise<DeviceInfo> { return this.getDeviceInfo(); }

    @exposed @info("List available disk drives and their usage")
    @wfApi
    @output(Sch.Array(DiskSchema))
    public async listDisks(): Promise<Disk[]> { return this._listDisks(); }

    @exposed @info("Read clipboard content")
    @wfApi
    @input(Sch.Name('mimeType', Sch.Optional(Sch.String)))
    public async readClipboard(mimeType?: string): Promise<ClipboardContent | null> { return this._readClipboard(mimeType); }

    // --- Protected methods (override these in subclasses) ---

    protected async _canControlAudioPlayback(): Promise<boolean> { return false; }
    protected async _canControlVolumeLevel(): Promise<boolean> { return false; }
    protected async _getAudioPlaybackInfo(): Promise<AudioPlaybackInfo | null> { throw new Error("Not supported."); }
    protected async _pauseAudioPlayback(): Promise<void> { throw new Error("Not supported."); }
    protected async _playAudioPlayback(): Promise<void> { throw new Error("Not supported."); }
    protected async _nextAudioTrack(): Promise<void> { throw new Error("Not supported."); }
    protected async _previousAudioTrack(): Promise<void> { throw new Error("Not supported."); }
    protected async _getVolumeLevel(): Promise<number> { throw new Error("Not supported."); }
    protected async _setVolumeLevel(level: number): Promise<void> { throw new Error("Not supported."); }
    protected async _getBatteryInfo(): Promise<BatteryInfo> { throw new Error("Not supported."); }
    protected async _canGetBatteryInfo(): Promise<boolean> { return false; }
    protected async _openUrl(url: string): Promise<void> { throw new Error("Method not implemented."); }
    protected async _openFile(filePath: string): Promise<void> { throw new Error("Method not implemented."); }
    protected async _lockScreen(): Promise<void> { throw new Error("Not supported."); }
    protected async _getScreenLockStatus(): Promise<ScreenLockStatus> { return 'not-supported'; }
    protected async _listDisks(): Promise<Disk[]> { throw new Error("Not implemented"); }
    protected async _readClipboard(mimeType?: string): Promise<ClipboardContent | null> { throw new Error("Not implemented"); }

    @serviceStartMethod
    public async start() {
    }

    @serviceStopMethod
    public async stop() {
    }
}
