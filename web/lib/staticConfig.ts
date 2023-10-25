declare global {
    interface Window {
        isDesktopApp?: boolean;
        appEvent?: {
            listen: (eventName: string, callback: (data: any) => void) => () => void;
        }
    }
}

export type StaticConfigType = {
    baseUrl: string;
    apiBaseUrl: string;
    envType: 'desktop' | 'node';
    isDev: boolean;
    webVersion: string;
}

export const staticConfig: StaticConfigType = {
    baseUrl: '',
    apiBaseUrl: '',
    envType: 'node',
    isDev: false,
    webVersion: 'unknown',
};

export function setupStaticConfig() {
    staticConfig.baseUrl = window.location.origin;
    staticConfig.webVersion = process.env.NEXT_PUBLIC_WEB_VERSION || 'unknown';
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
