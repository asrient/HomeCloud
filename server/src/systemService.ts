import { SystemService } from "shared/systemService";
import {
    DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories,
    Disk, ClipboardContent, ClipboardContentType, ClipboardFile,
    DeviceFormType
} from "shared/types";
import { exposed, serviceStartMethod, serviceStopMethod } from "shared/servicePrimatives";
import { getOSType, getOSFlavour, getSysDefaultDirectories, getUnixDisks } from "nodeShared/deviceInfo";

export default class ServerSystemService extends SystemService {

    cachedDeviceInfo: DeviceInfo | null = null;

    public async getDeviceInfo(): Promise<DeviceInfo> {
        if (!this.cachedDeviceInfo) {
            this.cachedDeviceInfo = {
                os: getOSType(),
                osFlavour: getOSFlavour(),
                formFactor: DeviceFormType.Server,
            };
        }
        return this.cachedDeviceInfo;
    }

    public async getDefaultDirectories(): Promise<DefaultDirectories> {
        return getSysDefaultDirectories();
    }

    public alert(title: string, description?: string): void {
        console.log(`[Alert] ${title}${description ? ': ' + description : ''}`);
    }

    public ask(config: NativeAskConfig): NativeAsk {
        throw new Error("Ask is not supported on HomeCloud Server");
    }

    public copyToClipboard(content: string | ClipboardFile[], type?: ClipboardContentType): void {
        throw new Error("Clipboard is not supported on HomeCloud Server");
    }

    public async share(options: { title?: string; description?: string; content?: string; files?: string[]; type: 'url' | 'text' | 'file' }): Promise<void> {
        throw new Error("Share is not supported on HomeCloud Server");
    }

    @exposed
    public async openUrl(url: string): Promise<void> {
        console.log(`[Server] openUrl: ${url}`);
        throw new Error("openUrl is not supported on HomeCloud Server");
    }

    @exposed
    public async openFile(filePath: string): Promise<void> {
        console.log(`[Server] openFile: ${filePath}`);
        throw new Error("openFile is not supported on HomeCloud Server");
    }

    @exposed
    public async listDisks(): Promise<Disk[]> {
        // For now we are only mapping the C drive on windows, can change later if needed.
        if (process.platform === 'win32') {
            return [{
                type: 'internal',
                path: 'C:\\',
                name: 'System (C:)',
                size: 0,
                free: 0,
            }];
        }
        return getUnixDisks();
    }

    @exposed
    public async readClipboard(): Promise<ClipboardContent | null> {
        return null;
    }

    public getAccentColorHex(): string {
        return '#0078d4';
    }

    @serviceStartMethod
    public async start() { }

    @serviceStopMethod
    public async stop() { }
}
