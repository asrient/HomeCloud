import { SystemService } from "shared/systemService.js";
import {
    DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories,
    Disk, ClipboardContent, ClipboardContentType, ClipboardFile,
    OSType, DeviceFormType
} from "shared/types.js";
import { exposed, serviceStartMethod, serviceStopMethod } from "shared/servicePrimatives.js";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function getOSType(): OSType {
    switch (process.platform) {
        case "win32":
            return OSType.Windows;
        case "darwin":
            return OSType.MacOS;
        case "linux":
            return OSType.Linux;
        default:
            return OSType.Unknown;
    }
}

function getOSFlavour(): string | null {
    const platform = process.platform;
    const release = os.release();

    if (platform === 'win32') {
        const majorVersion = parseInt(release.split('.')[0], 10);
        const buildNumber = parseInt(release.split('.')[2], 10);
        if (majorVersion === 10) {
            return buildNumber >= 22000 ? '11' : '10';
        }
        return null;
    } else if (platform === 'darwin') {
        const [major, minor] = os.release().split('.').map(Number);
        if (Number.isNaN(major) || Number.isNaN(minor)) return null;
        if (major < 20) return `10.${minor}`;
        if (major >= 25) return String(major + 1);
        return String(major - 9);
    } else if (platform === 'linux') {
        try {
            const fs = require('fs');
            const content = fs.readFileSync('/etc/os-release', 'utf8');
            const match = content.match(/^PRETTY_NAME="?(.+?)"?\s*$/m);
            if (match) return match[1];
            const idMatch = content.match(/^NAME="?(.+?)"?\s*$/m);
            if (idMatch) return idMatch[1];
        } catch { }
        return 'Linux';
    }
    return null;
}

let cachedDeviceInfo: DeviceInfo | null = null;

export default class ServerSystemService extends SystemService {

    public async getDeviceInfo(): Promise<DeviceInfo> {
        if (!cachedDeviceInfo) {
            cachedDeviceInfo = {
                os: getOSType(),
                osFlavour: getOSFlavour(),
                formFactor: DeviceFormType.Server,
            };
        }
        return cachedDeviceInfo;
    }

    public async getDefaultDirectories(): Promise<DefaultDirectories> {
        const home = os.homedir();
        return {
            Pictures: path.join(home, 'Pictures'),
            Documents: path.join(home, 'Documents'),
            Downloads: path.join(home, 'Downloads'),
            Videos: path.join(home, 'Videos'),
            Movies: path.join(home, 'Movies'),
            Music: path.join(home, 'Music'),
            Desktop: path.join(home, 'Desktop'),
        };
    }

    public alert(title: string, description?: string): void {
        console.log(`[Alert] ${title}${description ? ': ' + description : ''}`);
    }

    public ask(config: NativeAskConfig): NativeAsk {
        console.log(`[Ask] ${config.title}: ${config.description || ''}`);
        // Auto-confirm: call the first button's onPress
        if (config.buttons.length > 0 && config.buttons[0].onPress) {
            config.buttons[0].onPress();
        }
        return {
            close: () => { }
        };
    }

    public copyToClipboard(content: string | ClipboardFile[], type?: ClipboardContentType): void {
        // No-op on server
    }

    public async share(options: { title?: string; description?: string; content?: string; files?: string[]; type: 'url' | 'text' | 'file' }): Promise<void> {
        // No-op on server
    }

    @exposed
    public async openUrl(url: string): Promise<void> {
        console.log(`[Server] openUrl: ${url}`);
    }

    @exposed
    public async openFile(filePath: string): Promise<void> {
        console.log(`[Server] openFile: ${filePath}`);
    }

    @exposed
    public async listDisks(): Promise<Disk[]> {
        if (process.platform === 'win32') {
            return [{
                type: 'internal',
                path: 'C:\\',
                name: 'System (C:)',
                size: 0,
                free: 0,
            }];
        }

        const disks: Disk[] = [];
        try {
            const { stdout } = await execFileAsync('df', ['-Pk'], { encoding: 'utf8' });
            const lines = stdout.split('\n').slice(1);
            const linuxPermittedDriveLocations = ['/media/', '/mnt/', '/run/media/'];

            for (const line of lines) {
                if (!line.trim()) continue;
                const tokens = line.replace(/ +/g, ' ').split(' ');
                if (tokens.length < 6) continue;

                const filesystem = tokens[0];
                const blocks = parseInt(tokens[1], 10) || 0;
                const available = parseInt(tokens[3], 10) || 0;
                const location = tokens.slice(5).join(' ');
                let name = path.basename(location);
                let isExternal = false;

                if (
                    filesystem.startsWith('/dev/') ||
                    filesystem === 'devtmpfs' ||
                    filesystem === 'tmpfs' ||
                    filesystem === 'overlay'
                ) {
                    continue;
                }
                if (process.platform === 'linux') {
                    const permitted = linuxPermittedDriveLocations.some(p => location.startsWith(p));
                    if (!permitted && location !== '/') continue;
                }
                if (process.platform === 'darwin') {
                    if (location !== '/' && !location.startsWith('/Volumes/')) continue;
                }
                if (name === '') {
                    name = process.platform === 'linux' ? 'Hard Disk' : 'Macintosh HD';
                }
                if (location !== '/') {
                    isExternal = true;
                }
                disks.push({
                    type: isExternal ? 'external' : 'internal',
                    name,
                    path: location,
                    size: blocks * 1024,
                    free: available * 1024,
                });
            }
        } catch {
            disks.push({
                type: 'internal',
                path: '/',
                name: 'Root',
                size: 0,
                free: 0,
            });
        }
        return disks;
    }

    @exposed
    public async readClipboard(): Promise<ClipboardContent | null> {
        return null;
    }

    public getAccentColorHex(): string {
        return '#0078d4';
    }

    @serviceStartMethod
    public async start() { }

    @serviceStopMethod
    public async stop() { }
}
