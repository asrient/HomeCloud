import { OSType } from "@/lib/types";
import { DeviceInfo } from "shared/types";
import { Platform } from "react-native";
import ServiceController from "shared/controller";
import MobileServiceController from "./serviceController";
import { isLiquidGlassAvailable } from 'expo-glass-effect';

export function getAppName() {
  if ((global as any).modules?.config?.APP_NAME) {
    return (global as any).modules.config.APP_NAME;
  }
  return '[app]';
}


export function printFingerprint(fingerprint: string, full = false) {
  if (full) {
    return fingerprint;
  }
  return `$${fingerprint.slice(0, 8)}`;
}

/**
 * Check if a service endpoint is available on a service controller.
 * Handles the case where sc.isAvailable() itself doesn't exist (older peers).
 */
export async function isServiceAvailable(sc: ServiceController, path: string): Promise<boolean> {
  try {
    return await sc.isAvailable(path);
  } catch {
    return false;
  }
}

export async function getServiceController(fingerprint: string | null) {
  if (!fingerprint) {
    return modules.getLocalServiceController();
  }
  return modules.getRemoteServiceController(fingerprint);
}

export async function getExistingServiceController(fingerprint: string | null) {
  return modules.getExistingServiceController(fingerprint);
}

export function getLocalServiceController() {
  return MobileServiceController.getLocalInstance<MobileServiceController>();
}

export function libraryHashFromId(fingerprint: string | null, libraryId: string) {
  return `${fingerprint}-${libraryId}`;
}

export function getOSIconUrl(deviceInfo: DeviceInfo) {
  switch (deviceInfo.os) {
    case OSType.Windows:
      return require('@/assets/images/os/windows.png');
    case OSType.MacOS:
    case OSType.iOS:
      return require('@/assets/images/os/apple.png');
    case OSType.Linux:
      return require('@/assets/images/os/linux.png');
    case OSType.Android:
      return require('@/assets/images/os/android.png');
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

export function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, mon, dow] = parts;
  if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every minute';
  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    const n = parseInt(min.slice(2));
    return n === 1 ? 'Every minute' : `Every ${n} minutes`;
  }
  if (min === '0' && hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
    const n = parseInt(hour.slice(2));
    return n === 1 ? 'Every hour' : `Every ${n} hours`;
  }
  if (!min.includes('*') && !min.includes('/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Every hour at :${min.padStart(2, '0')}`;
  }
  if (!min.includes('*') && !hour.includes('*') && dom === '*' && mon === '*' && dow === '*') {
    return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (!min.includes('*') && !hour.includes('*') && dom === '*' && mon === '*' && dow !== '*' && !dow.includes(',')) {
    const dayIdx = parseInt(dow);
    const dayName = dayNames[dayIdx] ?? dow;
    return `Every ${dayName} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  if (!min.includes('*') && !hour.includes('*') && dom !== '*' && mon === '*' && dow === '*') {
    const suffix = dom === '1' ? 'st' : dom === '2' ? 'nd' : dom === '3' ? 'rd' : 'th';
    return `Monthly on the ${dom}${suffix} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  return cron;
}

/** iOS always supports HEIC; Android supports it natively from API 29 (Android 10+) */
export const supportsHeic = isIos || (Platform.OS === 'android' && (Platform.Version as number) >= 29);

export const isGlassEnabled = isIos && isLiquidGlassAvailable();

/**
 * Calculate bottom padding to account for the system navigation bar on Android (edge-to-edge).
 * On iOS, returns 0 since the system handles insets natively.
 */
export function getBottomPadding(bottomInset: number): number {
  return Platform.OS === 'android' ? bottomInset + 20 : 30;
}

/**
 * Calculate the tab bar height including safe area bottom inset.
 * iOS tab bar is 49pt, Android is 56dp.
 */
export function getTabBarHeight(bottomInset: number): number {
  return (isIos ? 49 : 56) + bottomInset;
}
