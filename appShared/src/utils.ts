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
