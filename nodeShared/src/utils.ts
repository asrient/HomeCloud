import os from "os";
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { DeviceInfo } from "shared/types";
import { execFile } from "child_process";
import { promisify } from "util";

export function getAppName(): string {
    if ((global as any).modules?.config?.APP_NAME) {
        return (global as any).modules.config.APP_NAME;
    }
    return '[app]';
}

const tempDir = os.tmpdir();
const scopedTmpDir = path.join(tempDir, 'HomeCloud');

// Does not actually create the directories
export function getPartionedTmpDir(serviceName: string) {
    return path.join(scopedTmpDir, serviceName);
}

export const cleanupTmpDir = async () => {
    try {
        await fs.promises.rm(scopedTmpDir, { recursive: true, force: true });
    } catch (error) {
        console.error('[Utils] Error cleaning tmp dir:', error);
    }
}

export async function removeTempFile(filePath: string) {
    return fs.promises.unlink(filePath);
}

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("error", (err) => reject(err));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
}

export async function streamToString(stream: Readable): Promise<string> {
    const buffer = await streamToBuffer(stream);
    return buffer.toString("utf8");
}

export async function streamToJson(stream: Readable) {
    const str = await streamToString(stream);
    return JSON.parse(str);
}

export function bufferToStream(buffer: Buffer): Readable {
    return Readable.from(buffer);
}

export function jsonToStream(json: any): Readable {
    return bufferToStream(Buffer.from(JSON.stringify(json)));
}

export function osInfoString(deviceInfo: DeviceInfo) {
    if (!deviceInfo.os) return '';
    return `${deviceInfo.os} ${deviceInfo.osFlavour}`;
}

export const execFileAsync = promisify(execFile);

export function deriveWsUrl(serverUrl: string): string {
    const isSecure = serverUrl.startsWith('https://');
    const url = serverUrl.replace(/^https?:\/\//, isSecure ? 'wss://' : 'ws://');
    console.log(`Derived WS_SERVER_URL: ${url} from SERVER_URL: ${serverUrl}`);
    return url;
}
