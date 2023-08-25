
let IS_DEV = false;

export function setDevMode(isDev: boolean) {
    IS_DEV = isDev;
}

export function isDevMode() {
    return IS_DEV;
}

export enum EnvType {
    Server = 'server',
    Desktop = 'desktop'
}

let ENV_TYPE = EnvType.Server;

export function setEnvType(envType: EnvType) {
    ENV_TYPE = envType;
}

export function getEnvType() {
    return ENV_TYPE;
}

export function isDesktop() {
    return ENV_TYPE === EnvType.Desktop;
}

export function isServer() {
    return ENV_TYPE === EnvType.Server;
}

let DATA_DIR = '';

export function setDataDir(dataDir: string) {
    DATA_DIR = dataDir;
}

export function getDataDir() {
    return DATA_DIR;
}
