declare global {
    interface Window {
        isDesktopApp?: boolean;
    }
}

export type StaticConfigType = {
    baseUrl: string;
    apiBaseUrl: string;
    envType: 'desktop' | 'node';
    isDev: boolean;
}

export const staticConfig: StaticConfigType = {
    baseUrl: '',
    apiBaseUrl: '',
    envType: 'node',
    isDev: false,
};

export function setupStaticConfig() {
    staticConfig.baseUrl = window.location.origin;
    staticConfig.envType = window.isDesktopApp ? 'desktop' : 'node';
    staticConfig.apiBaseUrl = `${staticConfig.baseUrl}/api`;
    if (window.location.host === 'localhost:3000') {
        staticConfig.isDev = true;
        if (staticConfig.envType === 'node') {
            staticConfig.apiBaseUrl = 'http://localhost:5000/api';
        } else {
            staticConfig.apiBaseUrl = 'app://host/api';
        }
    }
}

export function isDesktop() {
    return staticConfig.envType === 'desktop';
}
