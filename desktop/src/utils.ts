import os from "os";
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

export function importModule(moduleName: string) {
    return require(`../build/Release/${moduleName}.node`);
}

const tempDir = os.tmpdir();
const scopedTmpDir = path.join(tempDir, 'Homecloud');

// Does not actually create the directories
export function getPartionedTmpDir(serviceName: string) {
    return path.join(scopedTmpDir, serviceName);
}

export const cleanupTmpDir = async () => {
    try {
        await fs.promises.rm(scopedTmpDir, { recursive: true, force: true });
    } catch (error) {
        console.error('Error cleaning tmp dir:', error);
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
