import { ApiRequestFile } from "../interface";
import fs from "fs";
import os from "os";
import { v4 } from 'uuid';
import jwt from "jsonwebtoken";
import { envConfig } from "../envConfig";

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
