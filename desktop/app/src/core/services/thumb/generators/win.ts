import { native } from "../../../native";
import { platform } from "os";
import ThumbGenerator from "../generator";

export default class ThumbGeneratorWin extends ThumbGenerator {

    private _thumbModule: {
        generateThumbnail: (filePath: string) => Buffer | null;
        setup: () => void;
        stop: () => void;
    }

    override async setup() {
        const thumb = this.getThumbModule();
        thumb.setup();
    }

    override async stop() {
        const thumb = this.getThumbModule();
        thumb.stop();
    }

    getThumbModule() {
        if (platform() !== "win32") {
            throw new Error(`Windows Thumbnail module is not available on ${platform()}`);
        }
        if (!this._thumbModule) {
            this._thumbModule = native.importModule("ThumbnailWin");
        }
        return this._thumbModule;
    }

    async generateThumbnailJPEG(filePath: string): Promise<Buffer> {
        const thumb = this.getThumbModule();
        const data = thumb.generateThumbnail(filePath);
        if (!data) {
            throw new Error(`Thumbnail generation failed for ${filePath}`);
        }
        return data;
    }
}
