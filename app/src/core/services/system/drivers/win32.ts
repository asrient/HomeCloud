import { native } from "../../../native";
import { WinDriveDetails } from "../types";
import { platform } from "os";

let systemModule: {
    getDriveInfo: () => WinDriveDetails[];
}

function getSystemModule() {
    if (platform() !== "win32") {
        throw new Error(`Windows System module is not available on ${platform()}`);
    }
    if (!systemModule) {
        systemModule = native.importModule("SystemWin");
    }
    return systemModule;
}

export function getDriveDetails(): WinDriveDetails[] {
    const system = getSystemModule();
    return system.getDriveInfo();
}
