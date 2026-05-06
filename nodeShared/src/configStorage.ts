import ConfigStorage from "shared/storage.js";
import fs from "fs/promises";
import path from "path";

export default class NodeConfigStorage extends ConfigStorage {
    private getFilePath(): string {
        const dataDir = modules.config.DATA_DIR;
        return path.join(dataDir, 'Config', `${this.getStoreName()}.json`);
    }

    protected override async loadFromDisk(): Promise<any> {
        const filePath = this.getFilePath();
        try {
            await fs.access(filePath);
        } catch (error) {
            return null;
        }
        const data = await fs.readFile(filePath, 'utf-8');
        if (!data.trim()) {
            // Empty file. Treat as fresh.
            console.warn(`[NodeConfigStorage] Config file ${filePath} is empty, returning null.`);
            return null;
        }
        try {
            return JSON.parse(data);
        } catch (err) {
            console.error(`[NodeConfigStorage] Failed to parse ${filePath}:`, err);
            return null;
        }
    }

    protected override async saveToDisk(data: any): Promise<void> {
        const filePath = this.getFilePath();
        // create the directory if it does not exist
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        // Atomic write: write to a temp file then rename, so a crash mid-write
        // can't leave the config truncated/empty.
        const tmpPath = `${filePath}.tmp`;
        await fs.writeFile(tmpPath, JSON.stringify(data, null, 4));
        await fs.rename(tmpPath, filePath);
    }
}
