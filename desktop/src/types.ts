import { AppConfigType } from "shared/types";

export type DesktopConfigType = AppConfigType & {
    IS_DESKTOP_PACKED: boolean;
    USE_WEB_APP_SERVER: boolean;
}
export type WinDriveDetails = {
    path: string;
    type: WinDriveType;
    totalSpace: number;
    freeSpace: number;
    usedSpace: number;
    name: string;
}

export enum WinDriveType {
    DRIVE_REMOVABLE = "Removable",
    DRIVE_FIXED = "Fixed",
    DRIVE_REMOTE = "Network",
    DRIVE_CDROM = "CD-ROM",
    DRIVE_RAMDISK = "RAM Disk",
    DRIVE_NO_ROOT_DIR = "No Root Directory",
    DRIVE_UNKNOWN = "Unknown",
}
