import { StorageAuthType, StorageType, AppName } from './types';

export type OneAuthButtonConfig = {
    text: string;
    icon: string;
    styles?: {
        [key: string]: string;
    };
}

export const StorageTypeConfig: {
    [key in StorageType]: {
        name: string;
        authTypes: StorageAuthType[];
        oneAuthButtonConfig?: OneAuthButtonConfig;
        urlRequired?: boolean;
        allowedApps: AppName[];
    }
} = {
    [StorageType.WebDav]: {
        name: 'WebDAV',
        authTypes: [StorageAuthType.Basic, StorageAuthType.Digest, StorageAuthType.None],
        urlRequired: true,
        allowedApps: [AppName.Files],
    },
    [StorageType.Google]: {
        name: 'Google Drive',
        authTypes: [StorageAuthType.OneAuth],
        allowedApps: [AppName.Files],
        oneAuthButtonConfig: {
            text: 'Sign in with Google',
            icon: 'google',
            styles: {
                color: '#FFFFFF',
                backgroundColor: '#4285F4',
            },
        },
    },
    [StorageType.Local]: {
        name: 'Local',
        authTypes: [StorageAuthType.None],
        urlRequired: false,
        allowedApps: [AppName.Files, AppName.Photos, AppName.Notes],
    },
    [StorageType.Dropbox]: {
        name: 'Dropbox',
        authTypes: [StorageAuthType.OneAuth],
        allowedApps: [AppName.Files],
        oneAuthButtonConfig: {
            text: 'Sign in to Dropbox',
            icon: 'dropbox',
            styles: {
                color: '#FFFFFF',
                backgroundColor: '#0061fe',
            },
        },
    },
    [StorageType.Agent]: {
        name: 'Device',
        authTypes: [StorageAuthType.Pairing],
        urlRequired: false,
        allowedApps: [AppName.Files, AppName.Photos, AppName.Notes],
    }
}

export const AuthTypeNames: { [key in StorageAuthType]: string } = {
    'basic': 'Password',
    'digest': 'Password (digest)',
    'none': 'None',
    'oneauth': 'OneAuth',
    'pairing': 'Pair Device'
}

export function getStorageTypeConfig(type: StorageType) {
    return StorageTypeConfig[type];
}

export function isAuthTypeSupported(type: StorageType, authType: StorageAuthType) {
    const config = StorageTypeConfig[type];
    return config.authTypes.includes(authType);
}

export function getSupportedAuthTypes(type: StorageType) {
    return StorageTypeConfig[type].authTypes;
}

export function isOneAuthSupported(type: StorageType) {
    return isAuthTypeSupported(type, StorageAuthType.OneAuth);
}

export function getName(type: StorageType) {
    return StorageTypeConfig[type].name;
}

export function getOneAuthButtonConfig(type: StorageType) {
    let config = StorageTypeConfig[type].oneAuthButtonConfig;
    if (!config) {
        config = {
            text: `Connect to ${getName(type)}`,
            icon: 'oneauth',
        }
    }
    return config;
}

export function getAuthTypeName(authType: StorageAuthType) {
    return AuthTypeNames[authType];
}

export function isAppAllowed(type: StorageType, appName: AppName) {
    return StorageTypeConfig[type].allowedApps.includes(appName);
}
