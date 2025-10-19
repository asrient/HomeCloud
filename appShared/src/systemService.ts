import { Service, serviceStartMethod, serviceStopMethod, exposed, assertServiceRunning } from "./servicePrimatives";
import { DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories } from "./types";
import Signal from "./signals";


export abstract class SystemService extends Service {
    public init() {
        this._init();
    }

    public abstract getDeviceInfo(): Promise<DeviceInfo>;
    public abstract getDefaultDirectories(): Promise<DefaultDirectories>;

    public abstract alert(title: string, description?: string): void;

    public abstract ask(config: NativeAskConfig): NativeAsk;

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

    @serviceStartMethod
    public async start() {
    }

    @serviceStopMethod
    public async stop() {
    }
}
