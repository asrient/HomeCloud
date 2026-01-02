import { createReadStream } from 'fs';
import path from 'path';
import mime from "mime";
import { FileContent } from 'shared/types';
import { Readable } from 'stream';
import { ReadableStream } from 'stream/web';

/**
 * Gets the available drives on the system.
 * @returns A promise that resolves to an object with drive names as keys and their mount paths as values.
 */
export async function getNativeDrives(): Promise<{ [key: string]: string }> {
    const localSc = modules.getLocalServiceController();
    const drives = await localSc.system.listDisks();
    const result: { [key: string]: string } = {};
    drives.forEach((drive) => {
        result[drive.name] = drive.path;
    });
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
    const fileStream: ReadableStream<any> = Readable.toWeb(createReadStream(filePath));
    const fileName = path.basename(filePath);
    const mimeType = mime.getType(filePath) || "application/octet-stream";
    // Create a FileContent object
    const fileContentObj: FileContent = {
        name: fileName,
        stream: fileStream as globalThis.ReadableStream<any>, // Hack to shut up TS as it confuses Node and Web ReadableStream types
        mime: mimeType
    };
    return fileContentObj;
}
