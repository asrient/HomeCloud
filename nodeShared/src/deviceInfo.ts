import { DeviceFormType, OSType, DefaultDirectories, Disk } from "shared/types";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { execFileAsync } from "./utils";

export function getOSType(): OSType {
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

/**
 * Returns an aggregated OS version string.
 * Example outputs:
 * - Windows: "10", "11", "7"
 * - macOS: "10.14", "11", "12"
 * - Linux: "Ubuntu", "Arch", "Debian", etc.
 */
export function getOSFlavour(): string | null {
    const platform = process.platform;
    const release = os.release();

    if (platform === 'win32') {
        return getWindowsVersion(release);
    } else if (platform === 'darwin') {
        return getMacVersion();
    } else if (platform === 'linux') {
        return getLinuxDistro();
    }
    return null;
}

/**
 * Determines Windows version based on the release number.
 */
function getWindowsVersion(release: string) {
    const majorVersion = parseInt(release.split('.')[0], 10);
    const buildNumber = parseInt(release.split('.')[2], 10);

    if (majorVersion === 10) {
        return buildNumber >= 22000 ? '11' : '10';
    }

    switch (majorVersion) {
        case 6:
            const minorVersion = parseInt(release.split('.')[1], 10);
            return minorVersion === 1 ? '7' : '8';
        case 5:
            return 'XP';
        default:
            return null;
    }
}

/**
 * Determines macOS version using os.release.
 */
function getMacVersion() {
    const [major, minor] = os.release().split('.').map(Number);

    if (Number.isNaN(major) || Number.isNaN(minor)) {
        return null;
    }

    if (major < 20) return `10.${minor}`; // macOS before Big Sur
    if (major >= 25) return String(major + 1); // macOS Tahoe (Darwin 25 = macOS 26) and above
    // Big Sur to Sequoia: Darwin 20-24 = macOS 11-15
    return String(major - 9); // 20 -> 11, 21 -> 12, ..., 24 -> 15
}

/**
 * Determines Linux distribution using /etc/os-release.
 */
function getLinuxDistro() {
    try {
        const releaseInfo = execSync('cat /etc/os-release').toString();
        const lines = releaseInfo.split('\n');
        let distro: string = null;

        lines.forEach((line) => {
            if (line.startsWith('NAME=')) {
                distro = line.split('=')[1].replace(/"/g, '');
            }
        });

        return distro;
    } catch {
        return null;
    }
}

// Form factor

export function getFormFactor(): DeviceFormType {
    switch (process.platform) {
        case 'win32':
            return getWindowsFormFactor();
        case 'darwin':
            return getMacFormFactor();
        case 'linux':
            return DeviceFormType.Desktop; // Assume desktop for Linux
        default:
            return DeviceFormType.Unknown;
    }
}

/**
 * Determines if the macOS device is a MacBook (laptop) or an iMac/Mac (desktop) based on the model name.
 */
function getMacFormFactor(): DeviceFormType {
    try {
        const modelInfo = execSync('system_profiler SPHardwareDataType | grep "Model Name"', { encoding: 'utf-8' });

        if (modelInfo.includes('MacBook')) {
            return DeviceFormType.Laptop;
        } else if (modelInfo.includes('iMac') || modelInfo.includes('Mac mini') || modelInfo.includes('Mac Pro')) {
            return DeviceFormType.Desktop;
        }

        return DeviceFormType.Unknown;
    } catch {
        return DeviceFormType.Unknown;
    }
}

/**
 * Determines the form factor of a Windows device using PCSystemType.
 * 1 = Desktop, 2 = Mobile (Laptop), 3 = Workstation, etc.
 */
function getWindowsFormFactor(): DeviceFormType {
    try {
        // Retrieve PCSystemType from WMIC
        const pcSystemTypeInfo = execSync('wmic computersystem get pcSystemType', { encoding: 'utf-8' }).toLowerCase();
        const pcSystemType = pcSystemTypeInfo.split('\n')[1].trim();
        switch (pcSystemType) {
            case '2': // Mobile (Laptop)
                return DeviceFormType.Laptop;
            case '1': // Desktop
            case '3': // Workstation, treated as Desktop
                return DeviceFormType.Desktop;
            default:
                return DeviceFormType.Unknown;
        }
    } catch {
        return DeviceFormType.Unknown;
    }
}

function resolveDefaultDirectory(home: string, names: string[], fallback: string | null = null): string | null {
    for (const name of names) {
        const fullPath = path.join(home, name);
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
    }

    if (fallback !== null) {
        return fallback;
    }

    return null;
}

export function getSysDefaultDirectories(): DefaultDirectories {
    const home = os.homedir();
    const videoCandidates = process.platform === 'darwin' ? ['Movies', 'Videos'] : ['Videos', 'Movies'];
    const movieCandidates = process.platform === 'darwin' ? ['Movies', 'Videos'] : ['Movies', 'Videos'];

    return {
        Pictures: resolveDefaultDirectory(home, ['Pictures']),
        Documents: resolveDefaultDirectory(home, ['Documents']),
        Downloads: resolveDefaultDirectory(home, ['Downloads'], home),
        Videos: resolveDefaultDirectory(home, videoCandidates),
        Movies: resolveDefaultDirectory(home, movieCandidates),
        Music: resolveDefaultDirectory(home, ['Music']),
        Desktop: resolveDefaultDirectory(home, ['Desktop']),
    };
}

export async function getUnixDisks(): Promise<Disk[]> {

    if (process.platform === 'win32') {
        throw new Error("getUnixDisks is not supported on Windows");
    }

    const disks: Disk[] = [];

    // Use df -Pk for POSIX output with 1024-byte blocks
    const { stdout } = await execFileAsync('df', ['-Pk'], { encoding: 'utf8' });
    const lines = stdout.split('\n').slice(1); // skip header
    const linuxPermitedDriveLocations = ['/media/', '/mnt/', '/run/media/'];

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

        // Filter out irrelevant file systems
        if (filesystem === 'devfs' ||
            filesystem === 'devtmpfs' ||
            filesystem === 'tmpfs' ||
            filesystem === 'overlay' ||
            filesystem === 'map auto_home') {
            continue;
        }
        if (process.platform === 'linux') {
            const permitted = linuxPermitedDriveLocations.some(p => location.startsWith(p));
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
    return disks;
}

/**
 * Parse a macOS hostname to make it more presentable.
 * e.g., "Aritras-MacBook-Air-13307.local" -> "Aritras MacBook Air"
 */
function parseHostname(hostname: string): string {
    let name = hostname;
    // Remove .local suffix
    name = name.replace(/\.local$/, '');
    // Remove trailing numbers (e.g., -13307)
    name = name.replace(/-\d+$/, '');
    // Replace hyphens with spaces
    name = name.replace(/-/g, ' ');
    return name.trim();
}

/**
 * Get the user-friendly device name.
 * On macOS, this returns the "Computer Name" from System Preferences.
 * On other platforms, falls back to os.hostname().
 */
export function getDeviceName(): string {
    if (process.platform === 'darwin') {
        try {
            const computerName = execSync('scutil --get ComputerName', { encoding: 'utf-8' }).trim();
            if (computerName) {
                return computerName;
            }
        } catch {
            // Fall back to parsed hostname if scutil fails
        }
        return parseHostname(os.hostname());
    }
    return os.hostname();
}
