import { ApiRequestFile } from "../interface";
import fs from "fs";
import os from "os";
import {v4} from 'uuid';

const tempDir = os.tmpdir();

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
