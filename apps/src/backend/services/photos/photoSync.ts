import { FsDriver } from "../../storageKit/interface";
import { StorageMeta, Photo, createPhotoType } from "../../models";
import SyncEngine from "../syncEngine";

export default class PhotoSync extends SyncEngine {

    storageMeta: StorageMeta;

    constructor(fsDriver: FsDriver, storageMeta: StorageMeta) {
        const photosDir = storageMeta.photosDir;
        super(fsDriver, photosDir);
        this.storageMeta = storageMeta;
    }

    async setLastSyncTime(time: number): Promise<void> {
        this.storageMeta.photosLastSyncOn = new Date(time);
        await this.storageMeta.save();
    }

    async getLastSyncTime(): Promise<number> {
        return this.storageMeta.photosLastSyncOn.getTime();
    }

    async addItemsToDb(items: { [itemId: number]: any; }) {
        const photos: createPhotoType[] = Object.keys(items).map((itemId) => {
            return {
                ...items[parseInt(itemId)],
                itemId: parseInt(itemId),
            };
        });

        await Photo.createPhotosBulk(photos, this.storage);
    }
    async deleteItemsFromDb(itemIds: number[]) {
        await Photo.deletePhotos(itemIds, this.storage);
    }
    async deleteAllItemsFromDb() {
        await Photo.deleteAllPhotos(this.storage);
    }
    async updateItemsInDb(items: { [itemId: number]: any; }) {
        await Photo.updateBulk(items, this.storage);
    }
}
