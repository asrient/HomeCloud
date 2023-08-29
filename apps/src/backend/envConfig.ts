export enum EnvType {
    Server = 'server',
    Desktop = 'desktop'
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
}

export enum OptionalType  {
    Required = 'required',
    Optional = 'optional',
    Disabled = 'disabled',
}

export type ProfilesPolicy = {
    passwordPolicy: OptionalType; // Only applies to new profiles
    allowSignups: boolean;
    listProfiles: boolean; // Admins can still list profiles from settings
    syncPolicy: OptionalType;
    adminIsDefault: boolean; // Make new profiles admin by default
}

class EnvConfig {
    readonly DATA_DIR;
    readonly ENV_TYPE;
    readonly IS_DEV;
    readonly BASE_URL;
    readonly API_BASE_URL;
    readonly WEB_BUILD_DIR;
    readonly PROFILES_CONFIG;
    readonly SECRET_KEY;
    constructor(config: SetupParams) {
        this.DATA_DIR = config.dataDir || '';
        this.ENV_TYPE = config.envType;
        this.IS_DEV = config.isDev;
        this.BASE_URL = config.baseUrl;
        this.API_BASE_URL = config.apiBaseUrl || config.baseUrl + '/api/';
        this.WEB_BUILD_DIR = config.webBuildDir;
        this.PROFILES_CONFIG = config.profilesPolicy;
        this.SECRET_KEY = config.secretKey;
    }
    isDesktop() {
        return this.ENV_TYPE === EnvType.Desktop;
    }

    isServer() {
        return this.ENV_TYPE === EnvType.Server;
    }
}

export let envConfig: EnvConfig;

export function setupEnvConfig(config: SetupParams) {
    envConfig = new EnvConfig(config);
}
