import { Service, serviceStartMethod, serviceStopMethod, exposed, assertServiceRunning } from "./servicePrimatives";
import { DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories, AudioPlaybackInfo, BatteryInfo, Disk, ClipboardContent } from "./types";
import Signal from "./signals";


export abstract class SystemService extends Service {
    public init() {
        this._init();
    }

    public abstract getDeviceInfo(): Promise<DeviceInfo>;
    public abstract getDefaultDirectories(): Promise<DefaultDirectories>;

    public abstract alert(title: string, description?: string): void;

    public abstract ask(config: NativeAskConfig): NativeAsk;

    public abstract copyToClipboard(text: string, type?: 'text' | 'link' | 'html' | 'rtf'): void;

    // Audio
    @exposed
    public async canControlAudioPlayback(): Promise<boolean> {
        return false;
    }

    @exposed
    public async canControlVolumeLevel(): Promise<boolean> {
        return false;
    }

    @exposed
    public async getAudioPlaybackInfo(): Promise<AudioPlaybackInfo | null> {
        throw new Error("Not supported.");
    }

    public audioPlaybackSignal = new Signal<[AudioPlaybackInfo | null]>({ isExposed: true, isAllowAll: false });

    @exposed
    public async pauseAudioPlayback(): Promise<void> {
        throw new Error("Not supported.");
    }

    @exposed
    public async playAudioPlayback(): Promise<void> {
        throw new Error("Not supported.");
    }

    @exposed
    public async nextAudioTrack(): Promise<void> {
        throw new Error("Not supported.");
    }

    @exposed
    public async previousAudioTrack(): Promise<void> {
        throw new Error("Not supported.");
    }

    @exposed
    public async getVolumeLevel(): Promise<number> {
        throw new Error("Not supported.");
    }

    @exposed
    public async setVolumeLevel(level: number): Promise<void> {
        throw new Error("Not supported.");
    }

    // Battery info
    @exposed
    public async getBatteryInfo(): Promise<BatteryInfo> {
        throw new Error("Not supported.");
    }

    @exposed
    public async canGetBatteryInfo(): Promise<boolean> {
        return false;
    }

    public batteryInfoSignal = new Signal<[BatteryInfo]>({ isExposed: true, isAllowAll: false });

    public getAccentColorHex(): string {
        return "0078D4"; // Default accent color, can be overridden by subclasses
    }

    public accentColorChangeSignal = new Signal<[string]>();

    @exposed
    public async openUrl(url: string) {
        throw new Error("Method not implemented.");
    }

    @exposed
    public async openFile(filePath: string) {
        throw new Error("Method not implemented.");
    }

    @exposed
    public async deviceInfo(): Promise<DeviceInfo> {
        const deviceInfo = await this.getDeviceInfo();
        return deviceInfo;
    }

    @exposed
    public async listDisks(): Promise<Disk[]> {
        throw new Error("Not implemented");
    }

    @exposed
    public async readClipboard(): Promise<ClipboardContent | null> {
        throw new Error("Not implemented");
    }

    @serviceStartMethod
    public async start() {
    }

    @serviceStopMethod
    public async stop() {
    }
}
