import {
    metaFromPhotoStream,
    metaFromVideoStream,
} from "./metadata";
import fs from "fs";
import path from "path";
import { AssetDetailType } from "./types";

export default class AssetManager {
    private location: string;

    constructor(lcation: string) {
        this.location = lcation;
    }

    public async delete(directory: string, filename: string) {
        await fs.promises.unlink(path.join(this.location, directory, filename));
    }

    public async generateDetail(
        directory: string,
        filename: string,
        mimeType: string,
    ): Promise<AssetDetailType> {
        const filePath = path.join(this.location, directory, filename);
        if (mimeType.startsWith("image")) {
            return await metaFromPhotoStream(filePath);
        } else if (mimeType.startsWith("video")) {
            return await metaFromVideoStream(filePath);
        } else {
            throw new Error(`Unknown mime type ${mimeType}`);
        }
    }
}
