import ConfigStorage from "shared/storage";
import { File, Paths, Directory } from 'expo-file-system/next';

export default class MobileConfigStorage extends ConfigStorage {

    private getFilePath(): string {
        const dataDir = modules.config.DATA_DIR;
        return Paths.join(dataDir, 'Config', `${this.getStoreName()}.json`);
    }

    protected override async loadFromDisk(): Promise<any> {
        const filePath = this.getFilePath();
        // check if the file exists
        const file = new File(filePath);
        if (!file.exists) {
            // file does not exist, return empty object
            return null;
        }
        // read the file
        const data = file.text();
        // parse the json
        return JSON.parse(data);
    }

    protected override async saveToDisk(data: any): Promise<void> {
        const filePath = this.getFilePath();
        // ensure the directory exists
        const dir = new Directory(Paths.dirname(filePath));
        if (!dir.exists) {
            dir.create();
        }
        // create or open the file
        const file = new File(filePath);
        // write the file
        file.write(JSON.stringify(data, null, 4));
    }
}
