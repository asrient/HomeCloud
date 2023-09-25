import { FsDriver } from '../../storageKit/interface';
import { Storage, Thumb } from '../../models';
import { generateThumbnailUrl } from './generator';
import mime from 'mime';

export default class ThumbService {
    fsDriver: FsDriver;
    storage: Storage;

    constructor(fsDriver: FsDriver) {
        this.fsDriver = fsDriver;
        this.storage = fsDriver.storage;
    }

    public async getOrCreateThumb(fileId: string, lastUpdated: Date): Promise<Thumb> {
        let thumb = await Thumb.getThumb(fileId, this.storage);
        if (thumb && thumb.isUpToDate(lastUpdated)) {
            return thumb;
        }
        let [stream, mimeType] = await this.fsDriver.readFile(fileId);
        if(!mimeType) {
            mimeType = mime.getType(fileId) || 'application/octet-stream';
        }
        const url = await generateThumbnailUrl(stream, mimeType);
        if (thumb) {
            await thumb.updateThumb({
                image: url,
                mimeType,
            });
        } else {
            thumb = await Thumb.createThumb({
                fileId,
                image: url,
                mimeType,
                height: null,
                width: null,
            }, this.storage);
        }
        return thumb;
    }
}
