import { Service, serviceStartMethod, serviceStopMethod, exposed, assertServiceRunning } from "./primatives";
import { DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories } from "../types";


export abstract class SystemService extends Service {
    public init() {
        this._init();
    }

    public abstract getDeviceInfo(): Promise<DeviceInfo>;
    public abstract getDefaultDirectories(): Promise<DefaultDirectories>;

    public abstract alert(title: string, description?: string): void;

    public abstract ask(config: NativeAskConfig): NativeAsk;

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
