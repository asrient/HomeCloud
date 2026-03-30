import { createReadStream } from 'fs';
import path from 'path';
import mime from "mime";
import { FileContent } from 'shared/types';

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
    // Build a Web ReadableStream manually instead of Readable.toWeb() to avoid
    // "Controller is already closed" crashes when the RPC connection dies mid-transfer.
    // Readable.toWeb() doesn't guard against data events arriving after cancel().
    let nodeStream: ReturnType<typeof createReadStream>;
    const fileStream = new ReadableStream<Uint8Array>({
        start(controller) {
            nodeStream = createReadStream(filePath, { highWaterMark: 256 * 1024 });
            let cancelled = false;

            nodeStream.on('data', (chunk: Buffer) => {
                if (cancelled) return;
                try {
                    controller.enqueue(new Uint8Array(chunk));
                } catch {
                    // Controller already closed — destroy the source
                    cancelled = true;
                    nodeStream.destroy();
                }
            });
            nodeStream.on('end', () => {
                if (!cancelled) {
                    try { controller.close(); } catch { /* already closed */ }
                }
            });
            nodeStream.on('error', (err) => {
                if (!cancelled) {
                    try { controller.error(err); } catch { /* already closed */ }
                }
            });
        },
        cancel() {
            nodeStream?.destroy();
        }
    });

    const fileName = path.basename(filePath);
    const mimeType = mime.getType(filePath) || "application/octet-stream";
    const fileContentObj: FileContent = {
        name: fileName,
        stream: fileStream as globalThis.ReadableStream<any>,
        mime: mimeType
    };
    return fileContentObj;
}
