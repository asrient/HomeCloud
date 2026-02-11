import { importModule } from "../../../utils";
import { WinDriveDetails } from "../../../types";
import { platform } from "os";

let systemModule: {
    getDriveInfo: () => WinDriveDetails[];
    getClipboardFilePaths: () => string[];
    setClipboardFilePaths: (paths: string[]) => boolean;
    hasClipboardFilePaths: () => boolean;
}

function getSystemModule() {
    if (platform() !== "win32") {
        throw new Error(`Windows System module is not available on ${platform()}`);
    }
    if (!systemModule) {
        systemModule = importModule("SystemWin");
    }
    return systemModule;
}

export function getDriveDetails(): WinDriveDetails[] {
    const system = getSystemModule();
    return system.getDriveInfo();
}

export function getClipboardFilePaths(): string[] {
    const system = getSystemModule();
    return system.getClipboardFilePaths();
}

export function setClipboardFilePaths(paths: string[]): boolean {
    const system = getSystemModule();
    return system.setClipboardFilePaths(paths);
}

export function hasClipboardFilePaths(): boolean {
    const system = getSystemModule();
    return system.hasClipboardFilePaths();
}
