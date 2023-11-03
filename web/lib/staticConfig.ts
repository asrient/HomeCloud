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
    if (process.env.NODE_ENV === 'development') {
        console.log('🚀 Development mode');
        staticConfig.isDev = true;
    }
    if (staticConfig.envType === 'node' && process.env.NEXT_PUBLIC_API_BASE_URL) {
        staticConfig.apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    }
    if (staticConfig.envType === 'desktop' && process.env.NEXT_PUBLIC_DESKTOP_API_BASE_URL) {
        staticConfig.apiBaseUrl = process.env.NEXT_PUBLIC_DESKTOP_API_BASE_URL;
    }
}

export function isDesktop() {
    return staticConfig.envType === 'desktop';
}
