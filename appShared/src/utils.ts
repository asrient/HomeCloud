import { DeviceFormType, DeviceInfo, OSType, SimpleSchema } from "./types";

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
      if (major <= 15 || (major >= 26 && major <= 26)) { // Update this condition as new macOS versions are released
        return `${macff}_${major}`;
      }
      return macff;
    case OSType.iOS:
      return formFactor === DeviceFormType.Tablet ? "ipad" : "iphone";
    case OSType.Android:
      return "phone";
    case OSType.Linux:
    default:
      return formFactor === DeviceFormType.Desktop ? "pc" : "laptop";
  }
}

export function fp(fingerprint: string) {
  if (!fingerprint) return 'unknown';
  return fingerprint.slice(0, 5);
}

export async function getServiceController(fingerprint: string | null) {
  if (!fingerprint) {
    return modules.getLocalServiceController();
  }
  return modules.getRemoteServiceController(fingerprint);
}

/**
 * Get an existing service controller without attempting to create a new connection.
 * Fails fast if the device is not connected. Useful for media preview requests
 * where triggering a reconnection attempt would be inappropriate.
 */
export async function getExistingServiceController(fingerprint: string | null) {
  const localSc = modules.getLocalServiceController();
  if (!fingerprint) {
    return localSc;
  }
  const connectionInfo = localSc.net.getConnectionInfo(fingerprint);
  if (!connectionInfo) {
    throw new Error('Device is not connected');
  }
  // Connection exists — getRemoteServiceController will return immediately
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

export function isDebug(): boolean {
  return modules.config.IS_DEV;
}

/**
 * Safe IP for logging. Local/private IPs pass through as-is (useful for
 * subnet debugging). Public IPs are replaced with a short hash so they
 * are still correlatable across log lines but not personally identifiable.
 * IPv6 link-local (fe80::) passes through; all other IPv6 is hashed.
 */
export function safeIp(address: string): string {
  if (!address) return 'unknown';
  // IPv4
  if (isIpV4(address)) {
    return isLocalIp(address) ? address : `pubIPv4[${modules.crypto.hashString(address, 'sha256').slice(0, 8)}]`;
  }
  // IPv6 link-local
  if (address.startsWith('fe80:') || address.startsWith('::1')) {
    return address;
  }
  // All other IPv6 (global) — hash it
  return `pubIPv6[${modules.crypto.hashString(address, 'sha256').slice(0, 8)}]`;
}

export function validateSchema(value: any, schema: SimpleSchema, path: string = ''): string | null {
  if (value === null || value === undefined) {
    if (schema.nullable) return null;
    // Optional fields are handled by the required check on the parent object
    if (value === undefined) return null;
    return `${path}: expected non-null value`;
  }

  // Enum check
  if (schema.enum) {
    if (!schema.enum.includes(value)) return `${path}: must be one of [${schema.enum.join(', ')}], got ${JSON.stringify(value)}`;
    return null;
  }

  // Const check
  if (schema.const !== undefined) {
    if (value !== schema.const) return `${path}: must be ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`;
    return null;
  }

  // Union types
  if (schema.oneOf) {
    const match = schema.oneOf.some(s => validateSchema(value, s, path) === null);
    if (!match) return `${path}: does not match any of the expected types`;
    return null;
  }

  const type = schema.type;

  if (type === 'string') {
    if (typeof value !== 'string') return `${path}: expected string, got ${typeof value}`;
    if (schema.minLength !== undefined && value.length < schema.minLength) return `${path}: string too short (min ${schema.minLength})`;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${path}: string too long (max ${schema.maxLength})`;
    return null;
  }

  if (type === 'number' || type === 'integer') {
    if (typeof value !== 'number') return `${path}: expected number, got ${typeof value}`;
    if (type === 'integer' && !Number.isInteger(value)) return `${path}: expected integer`;
    if (schema.minimum !== undefined && value < schema.minimum) return `${path}: must be >= ${schema.minimum}`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${path}: must be <= ${schema.maximum}`;
    return null;
  }

  if (type === 'boolean') {
    if (typeof value !== 'boolean') return `${path}: expected boolean, got ${typeof value}`;
    return null;
  }

  if (type === 'stream') {
    if (!(value instanceof ReadableStream)) return `${path}: expected ReadableStream`;
    return null;
  }

  if (type === 'date') {
    if (value instanceof Date) return null;
    if (typeof value === 'string' && !isNaN(Date.parse(value))) return null;
    return `${path}: expected Date or date string, got ${typeof value}`;
  }

  if (type === 'array') {
    if (!Array.isArray(value)) return `${path}: expected array, got ${typeof value}`;
    if (schema.minItems !== undefined && value.length < schema.minItems) return `${path}: array too short (min ${schema.minItems})`;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${path}: array too long (max ${schema.maxItems})`;
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        const err = validateSchema(value[i], schema.items, `${path}[${i}]`);
        if (err) return err;
      }
    }
    return null;
  }

  if (type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) return `${path}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`;
    if (schema.required) {
      for (const key of schema.required) {
        if (value[key] === undefined) {
          return `${path}.${key}: required field missing`;
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (value[key] !== undefined) {
          const err = validateSchema(value[key], propSchema, `${path}.${key}`);
          if (err) return err;
        }
      }
    }
    return null;
  }

  return null;
}
