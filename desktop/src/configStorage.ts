import ConfigStorage from "./shared/storage";
import fs from "fs/promises";
import path from "path";

export default class DesktopConfigStorage extends ConfigStorage {

    private getFilePath(): string {
        const dataDir = modules.config.DATA_DIR;
        return path.join(dataDir, 'Config', `${this.getStoreName()}.json`);
    }

    protected override async loadFromDisk(): Promise<any> {
        const filePath = this.getFilePath();
        // check if the file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            // file does not exist, return empty object
            return null;
        }
        // read the file
        const data = await fs.readFile(filePath, 'utf-8');
        // parse the json
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
