import { importModule } from '../utils';

export const useNativeDiscovery = () => process.platform === 'win32';

export interface NativeServiceInfo {
    name: string;
    host: string;
    addresses: string[];
    port: number;
    txt: Record<string, string>;
}

export interface DiscoveryWinModule {
    startBrowse(queryName: string, callback: (service: NativeServiceInfo) => void): void;
    stopBrowse(): void;
    registerService(instanceName: string, hostname: string, port: number, txt: Record<string, string>): void;
    deregisterService(): void;
}

let nativeModule: DiscoveryWinModule | null = null;

export function getNativeModule(): DiscoveryWinModule {
    if (!nativeModule) {
        nativeModule = importModule("DiscoveryWin") as DiscoveryWinModule;
    }
    return nativeModule;
}
