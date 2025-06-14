import path from 'path';
import os from 'os';
import fs from 'fs';
import { dynamicImport } from "./core/utils";
import { envConfig } from './core/envConfig';

let _open: ((target: string, options?: any) => Promise<any>) | null = null;

async function getOpen() {
    if (!_open) {
        const module = await dynamicImport("open");
        _open = module.default;
    }
    return _open;
}

export function getDataDir(name: string) {
    switch (process.platform) {
        case 'win32':
            if (process.env.APPDATA)
                return path.join(process.env.APPDATA, name)
            else
                return path.join(os.homedir(), 'AppData', 'Local', name)
        case 'darwin':
            return path.join(os.homedir(), 'Library', 'Application Support', name)
        case 'linux':
            if (process.env.XDG_CONFIG_HOME)
                return path.join(process.env.XDG_CONFIG_HOME, name)
            else
                return path.join(os.homedir(), '.config', name)
        default:
            throw new Error('Unknown platform')
    }
}

export async function openApp(url: string) {
    const open = await getOpen();
    await open(url);
}

export function openWebApp() {
    const webUrl = envConfig.BASE_URL;
    openApp(webUrl);
}

export function getAssetPath() {
    return fs.realpathSync(path.join(__dirname, '..', 'assets'));
}

export function getUserLogDirectory(appName: string) {
    let logDir: string;
    switch (os.platform()) {
        case 'win32':
            // Windows: Use %LOCALAPPDATA% for user-specific logs
            logDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), appName, 'Logs');
            break;

        case 'darwin':
            // macOS: Use ~/Library/Logs for user-specific logs
            logDir = path.join(os.homedir(), 'Library', 'Logs', appName);
            break;

        case 'linux':
            // Linux: Use ~/.cache/yourapp/logs to avoid polluting the home directory
            logDir = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), appName, 'logs');
            break;

        default:
            // Fallback: Default to user's home directory logs folder
            logDir = path.join(os.homedir(), appName, 'logs');
    }
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    return logDir;
}

export function getAppIntent() {
    return process.argv[2] || 'activate';
}
