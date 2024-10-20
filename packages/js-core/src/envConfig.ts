import { Secret } from "jsonwebtoken";
import { joinUrlPath } from "./utils";

export enum EnvType {
  Server = "server",
  Desktop = "desktop",
}

export type SetupParams = {
  isDev: boolean;
  envType: EnvType;
  dataDir?: string;
  baseUrl: string;
  apiBaseUrl?: string;
  webBuildDir: string;
  profilesPolicy: ProfilesPolicy;
  secretKey: string;
  disabledStorageTypes?: StorageType[];
  oneAuthServerUrl: string | null;
  oneAuthAppId: string | null;
  userHomeDir?: string;
  allowPrivateUrls?: boolean;
  desktopIsPackaged?: boolean;
  version?: string;
  defaultProfileId?: number;
  agentPort?: number;
  deviceName: string;
  libraryDir: string;
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprint: string;
  certPem: string;
};

export enum OptionalType {
  Required = "required",
  Optional = "optional",
  Disabled = "disabled",
}

export type ProfilesPolicy = {
  passwordPolicy: OptionalType; // Only applies to new profiles
  allowSignups: boolean;
  listProfiles: boolean; // Admins can still list profiles from settings
  requireUsername: boolean;
  syncPolicy: OptionalType;
  adminIsDefault: boolean; // Make new profiles admin by default
  singleProfile: boolean;
};

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

export type AccessControl = { [key: string]: string };

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
  readonly ENV_TYPE: EnvType;
  readonly IS_DEV: boolean;
  readonly BASE_URL: string;
  readonly API_BASE_URL: string;
  readonly WEB_BUILD_DIR: string;
  readonly PROFILES_CONFIG: ProfilesPolicy;
  readonly SECRET_KEY: Secret;
  readonly ENABLED_STORAGE_TYPES: string | StorageType[];
  readonly ONEAUTH_SERVER_URL: string;
  readonly ONEAUTH_APP_ID: string;
  readonly USER_HOME_DIR: string;
  readonly ALLOW_PRIVATE_URLS: boolean;
  readonly DESKTOP_IS_PACKAGED: boolean;
  readonly VERSION: string;
  DEFAULT_PROFILE_ID: number | null;
  AGENT_PORT: number | null;
  readonly DEVICE_NAME: string;
  readonly LIBRARY_DIR: string;
  readonly PUBLIC_KEY_PEM: string;
  readonly PRIVATE_KEY_PEM: string;
  readonly FINGERPRINT: string;
  readonly CERTIFICATE_PEM: string;
  readonly PAIRING_AUTH_TYPE: PairingAuthType;

  constructor(config: SetupParams) {
    this.DATA_DIR = config.dataDir || "";
    this.ENV_TYPE = config.envType;
    this.IS_DEV = config.isDev;
    this.BASE_URL = config.baseUrl;
    this.API_BASE_URL =
      config.apiBaseUrl || joinUrlPath(config.baseUrl, "/api/");
    this.WEB_BUILD_DIR = config.webBuildDir;
    this.PROFILES_CONFIG = config.profilesPolicy;
    this.SECRET_KEY = config.secretKey;
    this.ENABLED_STORAGE_TYPES = !!config.disabledStorageTypes
      ? implementedStorageTypes.filter(
        (t) => !config.disabledStorageTypes?.includes(t),
      )
      : implementedStorageTypes;
    this.ONEAUTH_SERVER_URL = config.oneAuthServerUrl;
    this.ONEAUTH_APP_ID = config.oneAuthAppId;
    this.USER_HOME_DIR = config.userHomeDir;

    this.ALLOW_PRIVATE_URLS = config.allowPrivateUrls ?? false;
    this.DESKTOP_IS_PACKAGED = config.desktopIsPackaged ?? false;
    this.VERSION = config.version ?? null;
    this.DEFAULT_PROFILE_ID = config.defaultProfileId ?? null;
    this.AGENT_PORT = config.agentPort ?? null;
    this.DEVICE_NAME = config.deviceName;
    this.LIBRARY_DIR = config.libraryDir;
    this.PUBLIC_KEY_PEM = config.publicKeyPem;
    this.PRIVATE_KEY_PEM = config.privateKeyPem;
    this.FINGERPRINT = config.fingerprint;
    this.CERTIFICATE_PEM = config.certPem;
    this.PAIRING_AUTH_TYPE = config.envType === EnvType.Desktop ? PairingAuthType.OTP : PairingAuthType.Password;

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

  isDesktop() {
    return this.ENV_TYPE === EnvType.Desktop;
  }

  isServer() {
    return this.ENV_TYPE === EnvType.Server;
  }

  isOneAuthEnabled() {
    return !!this.ONEAUTH_SERVER_URL && !!this.ONEAUTH_APP_ID;
  }

  setMainProfileId(profileId: number) {
    this.DEFAULT_PROFILE_ID = profileId;
  }

  setAgentPort(port: number) {
    this.AGENT_PORT = port;
  }
}

export let envConfig: EnvConfig;

export function setupEnvConfig(config: SetupParams) {
  envConfig = new EnvConfig(config);
}
