import { ApiRequestFile } from "../interface";
import os from "os";
import { v4 } from 'uuid';
import jwt from "jsonwebtoken";
import { envConfig } from "../envConfig";
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import mime from "mime";
import { getDriveDetails } from "../services/system/drivers/win32";

const execAsync = promisify(exec);
const fsPromises = fs.promises;

const tempDir = os.tmpdir();
const scopedTmpDir = path.join(tempDir, 'Homecloud');

// Does not actually create the directories
export function getPartionedTmpDir(serviceName: string) {
    return path.join(scopedTmpDir, serviceName);
}

export const cleanupTmpDir = async () => {
    try {
        await fsPromises.rm(scopedTmpDir, { recursive: true, force: true });
    } catch (error) {
        console.error('Error cleaning tmp dir:', error);
    }
}

export async function apiFileToTempFile(file: ApiRequestFile): Promise<string> {
    const { stream } = file;
    const filename = v4();
    const filePath = `${tempDir}/${filename}`;
    const tempFile = fs.createWriteStream(filePath);
    stream.pipe(tempFile);
    return new Promise((resolve, reject) => {
        tempFile.on("finish", () => {
            resolve(filePath);
        });
        tempFile.on("error", (err) => {
            reject(err);
        });
    });
}

export async function removeTempFile(filePath: string) {
    return fs.promises.unlink(filePath);
}

export function generateFileAccessToken(storageId: number, fileId: string) {
    return jwt.sign({ storageId, fileId }, envConfig.SECRET_KEY, { expiresIn: "2h" });
}

export function verifyFileAccessToken(token: string) {
    if (!token) return null;
    try {
        const payload = jwt.verify(token, envConfig.SECRET_KEY) as jwt.JwtPayload;
        if (!payload.storageId || !payload.fileId) return null;
        return {
            storageId: payload.storageId,
            fileId: payload.fileId,
        };
    } catch (err) {
        return null;
    }
}

/**
 * Gets the available drives on the system.
 * @returns A promise that resolves to an object with drive names as keys and their mount paths as values.
 */
export async function getNativeDrives(): Promise<{ [key: string]: string }> {
    const platform = process.platform;
    try {
        if (platform === 'win32') {
            return getWindowsDrives();
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
function getWindowsDrives(): { [key: string]: string } {
    const drives = getDriveDetails();
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
