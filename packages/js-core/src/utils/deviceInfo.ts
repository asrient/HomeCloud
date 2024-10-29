import { DeviceFormType, DeviceInfo, envConfig, OSType } from "./../envConfig";
import os from "os";
import { execSync } from "child_process";

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

/**
 * Returns an aggregated OS version string.
 * Example outputs:
 * - Windows: "10", "11", "7"
 * - macOS: "10.14", "11", "12"
 * - Linux: "Ubuntu", "Arch", "Debian", etc.
 */
function getOSFlavour(): string | null {
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
    // Starting from Big Sur, the major version is 11 and above
    return String(major - 9); // 20 -> 11, 21 -> 12, etc.
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

function getFormFactor(): DeviceFormType {
    if(envConfig.isServer()) {
        return DeviceFormType.Server;
    }
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

/**
 * Returns the device information.
 * This function is used to determine the OS, OS version, and form factor of the device.
 * @returns An object containing the OS type, OS version, and form factor.
 * @example
 * {
 *  os: 'Windows',
 *  osFlavour: '10',
 *  formFactor: 'Desktop'
 * }
*/
export function getDeviceInfo(): DeviceInfo {
    return {
        os: getOSType(),
        osFlavour: getOSFlavour(),
        formFactor: getFormFactor(),
    };
}

let _deviceInfo: DeviceInfo | null = null;

/**
 * Returns the device information, caching the result for subsequent calls.
 */
export function getDeviceInfoCached(): DeviceInfo {
    if (!_deviceInfo) {
        _deviceInfo = getDeviceInfo();
    }
    return _deviceInfo;
}
