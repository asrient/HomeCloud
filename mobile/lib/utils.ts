import { OSType } from "@/lib/types";
import { DeviceInfo } from "shared/types";
import { Platform } from "react-native";


export function printFingerprint(fingerprint: string, full = false) {
    if (full) {
        return fingerprint;
    }
    return `$${fingerprint.slice(0, 8)}`;
}

export async function getServiceController(fingerprint: string | null) {
    if (!fingerprint) {
        return modules.getLocalServiceController();
    }
    return modules.getRemoteServiceController(fingerprint);
}

export function getLocalServiceController() {
    return modules.getLocalServiceController();
}

export function libraryHashFromId(fingerprint: string | null, libraryId: string) {
    return `${fingerprint}-${libraryId}`;
}

export function getOSIconUrl(deviceInfo: DeviceInfo) {
  switch (deviceInfo.os) {
    case OSType.Windows:
      return require('@/assets/images/os/windows.png');
    case OSType.MacOS:
      return require('@/assets/images/os/macos.png');
    case OSType.Linux:
        return require('@/assets/images/os/linux.png');
  }
    return require('@/assets/images/icon.png');
}

export const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
};


export const isIos = Platform.OS === 'ios';
