import { importModule } from "../../../utils";
import { platform } from "os";
import ThumbGenerator from "../generator";

export default class ThumbGeneratorMac extends ThumbGenerator {

    private _thumbModule: {
        generateThumbnail: (filePath: string, cb: (err: Error | null, data: Buffer) => undefined) => undefined;
    }

    getThumbModule() {
        if (platform() !== "darwin") {
            throw new Error(`Windows Thumbnail module is not available on ${platform()}`);
        }
        if (!this._thumbModule) {
            this._thumbModule = importModule("ThumbnailMac");
        }
        return this._thumbModule;
    }

    async generateThumbnailJPEG(filePath: string): Promise<Buffer> {
        const thumb = this.getThumbModule();
        return new Promise((resolve, reject) => {
            thumb.generateThumbnail(filePath, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }
}
