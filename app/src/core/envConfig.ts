import { Secret } from "jsonwebtoken";
import { joinUrlPath } from "./utils";

export const DEFAULT_AGENT_PORT = 7736;

export type SetupParams = {
  isDev: boolean;
  dataDir?: string;
  baseUrl: string;
  apiBaseUrl?: string;
  secretKey: string;
  disabledStorageTypes?: StorageType[];
  oneAuthServerUrl: string | null;
  oneAuthAppId: string | null;
  userHomeDir: string;
  desktopIsPackaged: boolean;
  version?: string;
  deviceName: string;
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprint: string;
  certPem: string;
  advertiseService: boolean;
  agentPort?: number;
  appName: string;
  userName: string;
};

export enum OptionalType {
  Required = "required",
  Optional = "optional",
  Disabled = "disabled",
}

export enum StorageAuthType {
  Basic = "basic",
  None = "none",
  Digest = "digest",
  OneAuth = "oneauth",
  Pairing = "pairing",
}

export const StorageAuthTypes = [
  StorageAuthType.Basic,
  StorageAuthType.None,
  StorageAuthType.Digest,
  StorageAuthType.OneAuth,
  StorageAuthType.Pairing,
];

export enum StorageType {
  WebDav = "webdav",
  Google = "google",
  Dropbox = "dropbox",
  Local = "local",
  Agent = "agent",
}

export enum PairingAuthType {
  Password = "password",
  OTP = "otp",
}

export enum OSType {
  Windows = "windows",
  MacOS = "macos",
  Linux = "linux",
  Android = "android",
  iOS = "ios",
  Unknown = "unknown",
}

export enum DeviceFormType {
  Desktop = "desktop",
  Laptop = "laptop",
  Mobile = "mobile",
  Tablet = "tablet",
  Unknown = "unknown",
  Server = "server",
}

export type DeviceInfo = {
  os: OSType;
  osFlavour: string | null;
  formFactor: DeviceFormType;
};

export const StorageTypeMeta: {
  [key in StorageType]: {
    name: string;
    allowedAuthTypes?: StorageAuthType[];
    allowedUrlProtocols?: string[];
    urlRequired?: boolean;
  };
} = {
  [StorageType.WebDav]: {
    name: "WebDAV",
    allowedAuthTypes: [
      StorageAuthType.Basic,
      StorageAuthType.Digest,
      StorageAuthType.None,
    ],
    allowedUrlProtocols: ["http", "https"],
    urlRequired: true,
  },
  [StorageType.Google]: {
    name: "Google Drive",
    allowedAuthTypes: [StorageAuthType.OneAuth],
    allowedUrlProtocols: [],
  },
  [StorageType.Local]: {
    name: "Local",
    allowedAuthTypes: [StorageAuthType.None],
  },
  [StorageType.Dropbox]: {
    name: "Dropbox",
    allowedAuthTypes: [StorageAuthType.OneAuth],
    allowedUrlProtocols: [],
  },
  [StorageType.Agent]: {
    name: "Agent",
    allowedAuthTypes: [StorageAuthType.Pairing],
  },
};

export const StorageTypes = Object.keys(StorageTypeMeta) as StorageType[];

export const implementedStorageTypes = [StorageType.WebDav, StorageType.Google, StorageType.Local, StorageType.Dropbox, StorageType.Agent];

class EnvConfig {
  readonly DATA_DIR: string;
  readonly IS_DEV: boolean;
  readonly BASE_URL: string;
  readonly API_BASE_URL: string;
  readonly SECRET_KEY: Secret;
  readonly ENABLED_STORAGE_TYPES: string | StorageType[];
  readonly ONEAUTH_SERVER_URL: string;
  readonly ONEAUTH_APP_ID: string;
  readonly USER_HOME_DIR: string;
  readonly DESKTOP_IS_PACKAGED: boolean;
  readonly VERSION: string;
  readonly AGENT_PORT: number;
  readonly DEVICE_NAME: string;
  readonly PUBLIC_KEY_PEM: string;
  readonly PRIVATE_KEY_PEM: string;
  readonly FINGERPRINT: string;
  readonly CERTIFICATE_PEM: string;
  readonly PAIRING_AUTH_TYPE: PairingAuthType;
  readonly ADVERTISE_SERVICE: boolean;
  readonly APP_NAME: string;
  readonly USER_NAME: string;

  constructor(config: SetupParams) {
    this.APP_NAME = config.appName || "HomeCloud";
    this.DATA_DIR = config.dataDir || "";
    this.IS_DEV = config.isDev;
    this.BASE_URL = config.baseUrl;
    this.API_BASE_URL =
      config.apiBaseUrl || joinUrlPath(config.baseUrl, "/api/");
    this.SECRET_KEY = config.secretKey;
    this.ENABLED_STORAGE_TYPES = !!config.disabledStorageTypes
      ? implementedStorageTypes.filter(
        (t) => !config.disabledStorageTypes?.includes(t),
      )
      : implementedStorageTypes;
    this.ONEAUTH_SERVER_URL = config.oneAuthServerUrl;
    this.ONEAUTH_APP_ID = config.oneAuthAppId;
    this.USER_HOME_DIR = config.userHomeDir;

    this.DESKTOP_IS_PACKAGED = config.desktopIsPackaged ?? false;
    this.VERSION = config.version ?? null;
    this.USER_NAME = config.userName || 'Homecloud User';
    this.DEVICE_NAME = config.deviceName;
    this.PUBLIC_KEY_PEM = config.publicKeyPem;
    this.PRIVATE_KEY_PEM = config.privateKeyPem;
    this.FINGERPRINT = config.fingerprint;
    this.CERTIFICATE_PEM = config.certPem;
    this.PAIRING_AUTH_TYPE = PairingAuthType.OTP;
    this.ADVERTISE_SERVICE = config.advertiseService;
    this.AGENT_PORT = config.agentPort || DEFAULT_AGENT_PORT;

    console.log(`🖥️ Device Name: ${this.DEVICE_NAME}`);
    console.log(`📂 Data Directory: ${this.DATA_DIR}`);
    console.log(`🆔 HomeCloud Version: ${this.VERSION || "Unknown"}`);
    if (this.IS_DEV) console.log("❗️ Warning: Running in DEV MODE ❗️");
    console.log("🌩️ Enabled storage types:", this.ENABLED_STORAGE_TYPES);
    // fingerprint is a unique identifier for the device
    console.log(`🔑 Device Fingerprint: ${this.FINGERPRINT}`);
  }

  isStorageTypeEnabled(type: StorageType) {
    return this.ENABLED_STORAGE_TYPES.includes(type);
  }

  isOneAuthEnabled() {
    return !!this.ONEAUTH_SERVER_URL && !!this.ONEAUTH_APP_ID;
  }
}

export let envConfig: EnvConfig;

export function setupEnvConfig(config: SetupParams) {
  envConfig = new EnvConfig(config);
}/**
 * Enum representing the origin type of a request.
 * @enum {string}
 */

export enum RequestOriginType {
  Web = 'Web',
  Agent = 'Agent'
}

