import { DeviceFormType, DeviceInfo, OSType } from "./types";

export function joinUrlPath(base: string, path: string) {
  if (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  if (path.startsWith("/")) {
    path = path.slice(1);
  }
  return `${base}/${path}`;
}

function normalizeDate(timestamp: number) {
  return Math.floor(timestamp / 1000) * 1000;
}

export function getToday() {
  return normalizeDate(Date.now());
}

export function getIconKey(deviceInfo: DeviceInfo) {
  const { formFactor, os, osFlavour } = deviceInfo;
  if (formFactor === DeviceFormType.Server) {
    return "server";
  }
  switch (os) {
    case OSType.Windows:
      let winff = formFactor === DeviceFormType.Desktop ? 'pc' : "laptop";
      if (osFlavour === '11') {
        return `${winff}_win11`;
      } else if (osFlavour === '10' && formFactor === DeviceFormType.Desktop) {
        return `${winff}_win10`;
      }
      return `${winff}_win`;
    case OSType.MacOS:
      let macff = formFactor === DeviceFormType.Desktop ? 'mac' : "macbook";
      if (!osFlavour) return macff;
      const major = parseInt(osFlavour.split('.')[0]);
      if (major <= 10) {
        return `${macff}_10`;
      }
      if (major <= 15) {
        return `${macff}_${major}`;
      }
      return macff;
    case OSType.Linux:
    default:
      return formFactor === DeviceFormType.Desktop ? "pc" : "laptop";
  }
}

export function deviceIdFromFingerprint(fingerprint: string) {
  return fingerprint.slice(0, 5);
}

export async function getServiceController(fingerprint: string | null) {
  if (!fingerprint) {
    return modules.getLocalServiceController();
  }
  return modules.getRemoteServiceController(fingerprint);
}

export function isIpV4(address: string): boolean {
  const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(address);
}

export function isSameNetwork(netA: string, netB: string): boolean {
  const partsA = netA.split('.').map(part => parseInt(part, 10));
  const partsB = netB.split('.').map(part => parseInt(part, 10));
  if (partsA.length !== 4 || partsB.length !== 4) {
    return false;
  }
  return partsA[0] === partsB[0] && partsA[1] === partsB[1];
}

/* 
Check if an IP address is in a local/private range
VALID RANGES:
- 10.0.0.0 to 10.255.255.255
- 172.16.0.0 to 172.31.255.255
- 192.168.0.0 to 192.168.255.255
- 127.0.0.0 to 127.255.255.255 (localhost)
*/
export function isLocalIp(address: string): boolean {
  if (!isIpV4(address)) {
    return false;
  }
  const parts = address.split('.').map(part => parseInt(part, 10));
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 127)
  );
}

export function isLoopbackIp(address: string): boolean {
  if (!isIpV4(address)) {
    return false;
  }
  const parts = address.split('.').map(part => parseInt(part, 10));
  return parts[0] === 127;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function filterValidBonjourIps(addresses: string[]): string[] {
  return addresses.filter(addr => isLocalIp(addr) && !isLoopbackIp(addr));
}
