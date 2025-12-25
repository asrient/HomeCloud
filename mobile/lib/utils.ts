import { OSType } from "@/lib/types";
import { DeviceInfo } from "shared/types";


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
