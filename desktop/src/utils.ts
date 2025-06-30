import os from "os";
import fs from 'fs';
import path from 'path';

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

export async function getServiceController(fingerprint: string | null) {
    if (!fingerprint) {
        return modules.getLocalServiceController();
    }
    return modules.getRemoteServiceController(fingerprint);
}
