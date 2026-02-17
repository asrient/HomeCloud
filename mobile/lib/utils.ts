import { OSType } from "@/lib/types";
import { DeviceInfo } from "shared/types";
import { Platform } from "react-native";
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

export async function getServiceController(fingerprint: string | null) {
  if (!fingerprint) {
    return modules.getLocalServiceController();
  }
  return modules.getRemoteServiceController(fingerprint);
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

/** iOS always supports HEIC; Android supports it natively from API 29 (Android 10+) */
export const supportsHeic = isIos || (Platform.OS === 'android' && (Platform.Version as number) >= 29);

export const isGlassEnabled = isIos && isLiquidGlassAvailable();

/**
 * Calculate bottom padding to account for the system navigation bar on Android (edge-to-edge).
 * On iOS, returns 0 since the system handles insets natively.
 */
export function getBottomPadding(bottomInset: number): number {
  return Platform.OS === 'android' ? bottomInset + 20 : 0;
}

/**
 * Calculate the tab bar height including safe area bottom inset.
 * iOS tab bar is 49pt, Android is 56dp.
 */
export function getTabBarHeight(bottomInset: number): number {
  return (isIos ? 49 : 56) + bottomInset;
}
