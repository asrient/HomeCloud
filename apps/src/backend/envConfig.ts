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
};

export enum StorageAuthType {
  Basic = "basic",
  None = "none",
  Digest = "digest",
  OneAuth = "oneauth",
}

export const StorageAuthTypes = [
  StorageAuthType.Basic,
  StorageAuthType.None,
  StorageAuthType.Digest,
  StorageAuthType.OneAuth,
];

export enum StorageType {
  WebDav = "webdav",
  Google = "google",
  Local = "local",
}

export const StorageTypeMeta: {
  [key in StorageType]: {
    name: string;
    allowedAuthTypes?: StorageAuthType[];
    allowedUrlProtocols?: string[];
    urlIsPath?: boolean;
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
  },
  [StorageType.Google]: {
    name: "Google Drive",
    allowedAuthTypes: [StorageAuthType.OneAuth],
    allowedUrlProtocols: [],
  },
  [StorageType.Local]: {
    name: "Local",
    allowedAuthTypes: [StorageAuthType.None],
    urlIsPath: true,
  },
};

export const StorageTypes = Object.keys(StorageTypeMeta) as StorageType[];

export const implementedStorageTypes = [StorageType.WebDav, StorageType.Google, StorageType.Local];

class EnvConfig {
  readonly DATA_DIR;
  readonly ENV_TYPE;
  readonly IS_DEV;
  readonly BASE_URL;
  readonly API_BASE_URL;
  readonly WEB_BUILD_DIR;
  readonly PROFILES_CONFIG;
  readonly SECRET_KEY;
  readonly ENABLED_STORAGE_TYPES;
  readonly ONEAUTH_SERVER_URL;
  readonly ONEAUTH_APP_ID;
  readonly USER_HOME_DIR;

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

    if (this.IS_DEV) console.log("❗️ Warning: Running in DEV MODE ❗️");
    console.log("🌩️ Enabled storage types:", this.ENABLED_STORAGE_TYPES);
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
}

export let envConfig: EnvConfig;

export function setupEnvConfig(config: SetupParams) {
  envConfig = new EnvConfig(config);
}
