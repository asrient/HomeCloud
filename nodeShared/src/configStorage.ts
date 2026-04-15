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
        return JSON.parse(data);
    }

    protected override async saveToDisk(data: any): Promise<void> {
        const filePath = this.getFilePath();
        // create the directory if it does not exist
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        // write the file
        await fs.writeFile(filePath, JSON.stringify(data, null, 4));
    }
}
