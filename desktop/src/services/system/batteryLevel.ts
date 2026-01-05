import { BatteryInfo } from "shared/types";
import { platform } from "process";
import { execa } from 'execa';
import { powerMonitor } from "electron";
import { readFile } from 'fs/promises';

async function batteryLevelMac2(): Promise<number> {
    try {
        const { stdout } = await execa('pmset', ['-g', 'batt']);
        const match = stdout.match(/(\d+)%/);
        if (match) {
            const percentage = parseInt(match[1]);
            return percentage / 100;
        }
        throw new Error('Could not parse battery level from pmset output');
    } catch (error) {
        console.error('Error getting battery level on Mac (pmset):', error);
        throw error;
    }
}


async function batteryLevelMac(): Promise<number> {
    const { stdout } = await execa('ioreg', ['-n', 'AppleSmartBattery', '-r', '-a']);
    // Parse the output to find CurrentCapacity and MaxCapacity
    const currentCapacityMatch = stdout.match(/"CurrentCapacity"\s*=\s*(\d+)/);
    const maxCapacityMatch = stdout.match(/"MaxCapacity"\s*=\s*(\d+)/);

    if (currentCapacityMatch && maxCapacityMatch) {
        const current = parseInt(currentCapacityMatch[1]);
        const max = parseInt(maxCapacityMatch[1]);
        return current / max;
    }
    console.warn('Could not parse battery capacity on Mac, using alternative method.');
    return batteryLevelMac2();
}

async function batteryLevelWin(): Promise<number> {
    try {
        const { stdout } = await execa('WMIC', ['Path', 'Win32_Battery', 'Get', 'EstimatedChargeRemaining']);
        const level = parseFloat(stdout.split('\n')[1]);
        const percentage = level > 100 ? 100 : level;
        return percentage / 100;
    } catch (error) {
        console.error('Error getting battery level on Windows:', error);
        return 1;
    }
}

async function batteryLevelLinux(): Promise<number> {
    try {
        // Try to find battery devices with upower
        const { stdout: devices } = await execa('upower', ['-e']);
        const batteryDevices = devices.split('\n').filter(line => line.includes('battery'));

        if (batteryDevices.length === 0) {
            return 1;
        }

        // Get info for the first battery
        const { stdout } = await execa('upower', ['-i', batteryDevices[0]]);
        const percentageMatch = stdout.match(/percentage:\s*(\d+)%/);

        if (percentageMatch) {
            return parseInt(percentageMatch[1]) / 100;
        }
        return 1;
    } catch (error) {
        // Fallback: read directly from sysfs
        try {
            const capacity = await readFile('/sys/class/power_supply/BAT0/capacity', 'utf8');
            const percentage = parseInt(capacity.trim());
            return percentage / 100;
        } catch (fallbackError) {
            console.error('Error getting battery level on Linux:', error, fallbackError);
            throw error;
        }
    }
}

export async function getBatteryInfo(): Promise<BatteryInfo> {
    const isCharging = powerMonitor.isOnBatteryPower() === false;
    let level = 1;
    if (platform === 'darwin') {
        level = await batteryLevelMac();
    } else if (platform === 'win32') {
        level = await batteryLevelWin();
    } else if (platform === 'linux') {
        level = await batteryLevelLinux();
    }
    return {
        level,
        isCharging,
    };
}

function normalizeBatteryLevel(level: number): number {
    // round up upto two decimal places
    return Math.round(level * 100) / 100;
}

function hasBatteryInfoChanged(oldInfo: BatteryInfo, newInfo: BatteryInfo): boolean {
    oldInfo.level = normalizeBatteryLevel(oldInfo.level);
    newInfo.level = normalizeBatteryLevel(newInfo.level);
    return oldInfo.level !== newInfo.level
        || oldInfo.isCharging !== newInfo.isCharging
        || oldInfo.isLowPowerMode !== newInfo.isLowPowerMode;
}

let currentBatteryInfo: BatteryInfo | null = null;

export function onBatteryInfoChanged(callback: (info: BatteryInfo) => void) {
    powerMonitor.on('on-battery', () => {
        getBatteryInfo().then(callback);
    });
    powerMonitor.on('on-ac', () => {
        getBatteryInfo().then(callback);
    });
    // Polling for battery level changes every 2 minutes
    setInterval(async () => {
        const info = await getBatteryInfo();
        if (currentBatteryInfo === null || hasBatteryInfoChanged(currentBatteryInfo, info)) {
            currentBatteryInfo = info;
            callback(info);
        }
    }, 2 * 60 * 1000);
}
