const API_HOST = '127.0.0.1';
const API_PORT = 5000;

export type StaticConfigType = {
    baseUrl: string;
    apiBaseUrl: string;
    isDev: boolean;
    webVersion: string;
}

export const staticConfig: StaticConfigType = {
    baseUrl: '',
    apiBaseUrl: '',
    isDev: false,
    webVersion: 'unknown',
};

export function setupStaticConfig() {
    if (typeof window === 'undefined') return;
    staticConfig.baseUrl = window.location.origin;
    staticConfig.webVersion = process.env.NEXT_PUBLIC_WEB_VERSION || 'unknown';
    staticConfig.apiBaseUrl = `http://${API_HOST}:${API_PORT}/api`;
    if (process.env.NODE_ENV === 'development') {
        console.log('🚀 Development mode');
        staticConfig.isDev = true;
    }
}
