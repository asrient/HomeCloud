import { OSType } from '@/lib/types';
import { DeviceInfo, PeerInfo } from 'shared/types';
import { IconSymbolName } from './UIIcon';

export function getDeviceIconName(deviceInfo: DeviceInfo): IconSymbolName {
  switch (deviceInfo.formFactor) {
    case 'mobile':
      if (deviceInfo.os === OSType.iOS) {
        return 'iphone';
      } else {
        return 'smartphone';
      }
    case 'tablet':
      return 'ipad.landscape';
    case 'laptop':
      return 'laptopcomputer';
    case 'desktop':
      return 'desktopcomputer';
    default:
      return 'tv';
  }
}

export function getPeerIconName(peer: PeerInfo): IconSymbolName {
  return getDeviceIconName(peer.deviceInfo);
}
