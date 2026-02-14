import { importModule } from "./utils";
import { platform } from "os";

/**
 * Wrapper for the AppContainerWin native addon.
 * Handles MSIX/AppX specific WinRT APIs:
 *  - Package identity detection (isAppContainerWin)
 *  - StartupTask management
 *  - Package version retrieval
 */

let appContainerModule: {
    isPackaged: () => boolean;
    getPackageVersion: () => string | null;
    getStartupTaskState: (taskId: string) => string;
    requestEnableStartupTask: (taskId: string) => string;
    disableStartupTask: (taskId: string) => void;
};

function getModule() {
    if (platform() !== "win32") {
        throw new Error(`AppContainerWin module is not available on ${platform()}`);
    }
    if (!appContainerModule) {
        appContainerModule = importModule("AppContainerWin");
    }
    return appContainerModule;
}

// ── Package identity ────────────────────────────────────────────────

/**
 * Check if running in a packaged (MSIX/AppX) context.
 * Returns false on non-Windows or when running as Squirrel/dev.
 */
export function isAppContainerWin(): boolean {
    if (platform() !== "win32") return false;
    try {
        return getModule().isPackaged();
    } catch {
        return false;
    }
}

/**
 * Get the MSIX package version (e.g., "1.2.3.0").
 * Returns null if not packaged.
 */
export function getPackageVersion(): string | null {
    if (!isAppContainerWin()) return null;
    return getModule().getPackageVersion();
}

// ── StartupTask ─────────────────────────────────────────────────────

export type StartupTaskState = 'enabled' | 'disabled' | 'disabledByUser' | 'disabledByPolicy' | 'enabledByPolicy' | 'unknown';

export function getStartupTaskState(taskId: string): StartupTaskState {
    return getModule().getStartupTaskState(taskId) as StartupTaskState;
}

export function requestEnableStartupTask(taskId: string): StartupTaskState {
    return getModule().requestEnableStartupTask(taskId) as StartupTaskState;
}

export function disableStartupTask(taskId: string): void {
    getModule().disableStartupTask(taskId);
}
