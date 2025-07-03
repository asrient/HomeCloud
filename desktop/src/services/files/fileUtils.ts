import { exec } from 'child_process';
import { promisify } from 'util';
import fs, { createReadStream } from 'fs';
import path from 'path';
import mime from "mime";
import DesktopSystemService from "../system/systemService";
import { FileContent } from 'shared/types';
import { Readable } from 'stream';

const execAsync = promisify(exec);
const fsPromises = fs.promises;

/**
 * Gets the available drives on the system.
 * @returns A promise that resolves to an object with drive names as keys and their mount paths as values.
 */
export async function getNativeDrives(): Promise<{ [key: string]: string }> {
    const platform = process.platform;
    try {
        if (platform === 'win32') {
            return await getWindowsDrives();
        } else if (platform === 'darwin') {
            return await getMacDrives();
        } else if (platform === 'linux') {
            return await getLinuxDrives();
        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }
    } catch (error) {
        console.error('Failed to get native drives:', error);
        return {};
    }
}

/**
 * Gets the available drives on Windows.
 */
async function getWindowsDrives(): Promise<{ [key: string]: string }> {
    const sys: DesktopSystemService = DesktopSystemService.getInstance();
    const drives = await sys.getWindowsDrives();
    const result: { [key: string]: string } = {};
    drives.map((drive) => {
        const letter = drive.path.replace('\\', '');
        result[`${drive.name} (${letter})`] = drive.path;
    });
    return result;
}

/**
 * Gets the available drives on macOS from the /Volumes directory.
 */
async function getMacDrives(): Promise<{ [key: string]: string }> {
    const volumesDir = '/Volumes';
    const drives = await fsPromises.readdir(volumesDir);
    const result: { [key: string]: string } = {};
    await Promise.all(drives.map(async (drive) => {
        const fullPath = path.join(volumesDir, drive);
        const stats = await fsPromises.lstat(fullPath);
        if (stats.isDirectory()) {
            let resolvedPath = fullPath;
            if (stats.isSymbolicLink()) {
                resolvedPath = await fsPromises.realpath(fullPath);
            }
            result[drive] = resolvedPath;
        }
    }
    ));
    if (Object.keys(result).length === 0) {
        console.warn('No drives found on macOS, generating default drive');
        result['Macintosh HD'] = '/';
    }
    return result;
}

/**
 * Gets the available drives on Linux by checking mounted devices in /media.
 */
const linuxPermitedDriveLocations = ['/media/', '/mnt/', '/run/media/'];
async function getLinuxDrives(): Promise<{ [key: string]: string }> {
    const result: { [key: string]: string } = {
        'HardDisk': '/',
    };

    try {
        const { stdout } = await execAsync('df -h --output=source,target');
        const lines = stdout.split('\n').slice(1);

        lines.forEach((line) => {
            const parts = line.trim().split(/\s+/);
            if (parts.length === 2) {
                const device = parts[0];
                const mountPoint = parts[1];

                if (device.startsWith('/dev/') && linuxPermitedDriveLocations.some((location) => mountPoint.startsWith(location))) {
                    const driveName = mountPoint.split('/').pop() || mountPoint;
                    result[driveName] = mountPoint;
                }
            }
        });
    } catch (error) {
        console.error('Error executing df command:', error);
    }

    return result;
}

export function getMimeType(filePath: string, isDirectory = false): string {

    const ext = path.extname(filePath);

    if (isDirectory) {
        if (ext === '.app') {
            return 'application/x-apple-app';
        }
        return 'application/x-folder';
    }

    if (ext === '.exe') {
        return 'application/vnd.microsoft.portable-executable';
    }
    if (ext === '.msi') {
        return 'application/x-msi';
    }
    if (ext === '.appimage') {
        return 'application/x-executable';
    }
    if (ext === '.deb') {
        return 'application/vnd.debian.binary-package';
    }
    if (ext === '.rpm') {
        return 'application/x-rpm';
    }
    if (ext === '.dmg') {
        return 'application/x-apple-diskimage';
    }
    return mime.getType(filePath) || 'application/octet-stream';
}

export function getFileContent(filePath: string): FileContent {
    const fileStream = Readable.toWeb(createReadStream(filePath));
    const fileName = path.basename(filePath);
    const mimeType = mime.getType(filePath) || "application/octet-stream";
    // Create a FileContent object
    const fileContentObj: FileContent = {
        name: fileName,
        stream: fileStream,
        mime: mimeType
    };
    return fileContentObj;
}
