import { FsDriver, RemoteItem } from "../../storageKit/interface";
import { Storage, StorageMeta, createPhotoType, Photo } from "../../models";
import { ApiRequestFile } from "../../interface";
import AssetManager from "./assetManager";
import PhotoSync from "./photoSync";
import { cloneStream } from "../../utils";
import { ReadStream } from "fs";
import { AssetDetailType } from "./metadata";

/**
 * photoNum format: [folderNo]/[itemId]
 * itemId is maintained globally (across all folders) and is auto increasing.
 */

type createPhoto_ = {
    itemId: number,
    assetFileId: string,
    detail: AssetDetailType,
    mime: string,
    size: number,
}

export class UploadManager {
    photoService: PhotosService;
    photoSync: PhotoSync;
    nextItemId: number | null = null;
    reqs: createPhoto_[] = [];
    constructor(photoService: PhotosService) {
        this.photoService = photoService;
        this.photoSync = photoService.photoSync;
    }

    async getNextItemId() {
        if (this.nextItemId === null) {
            this.nextItemId = await this.photoSync.getNextItemId();
            return this.nextItemId;
        }
        this.nextItemId++;
        return this.nextItemId;
    }

    public async start() {
        await this.photoSync.softSync();
        await this.photoSync.aquireLock();
    }

    public async addPhoto(file: ApiRequestFile) {
        const itemId = await this.getNextItemId();
        const stream = cloneStream(file.stream as ReadStream);
        let assetFile: RemoteItem | null = null;
        let detail: AssetDetailType | null = null;
        const getDetail = async () => {
            console.log('Generating metadata..', itemId, file.mime);
            detail = await this.photoService.assetManager.generateDetail(stream.clone(), file.mime);
            console.log('Generated metadata', itemId);
        };
        const getAssetFileId = async () => {
            console.log('Creating asset..', itemId, file.mime);
            assetFile = await this.photoService.assetManager.createAsset(itemId, stream, file.mime);
            console.log('Created asset', itemId, assetFile.id);
        };
        await Promise.all([getDetail(), getAssetFileId()]);
        this.reqs.push({
            itemId,
            mime: file.mime,
            assetFileId: assetFile!.id,
            detail: detail!,
            size: assetFile!.size || 0,
        });
    }

    public async end() {
        try {
            await this.photoService.createPhotos(this.reqs);
        }
        catch (e) {
            console.error(e);
        }
        await this.photoSync.releaseLock();
    }
}

export default class PhotosService {
    fsDriver: FsDriver;
    storage: Storage;
    storageMeta: StorageMeta;
    assetManager: AssetManager;
    photoSync: PhotoSync;

    constructor(fsDriver: FsDriver, storageMeta: StorageMeta) {
        this.fsDriver = fsDriver;
        this.storage = fsDriver.storage;
        this.storageMeta = storageMeta;
        this.assetManager = new AssetManager(fsDriver, storageMeta);
        this.photoSync = new PhotoSync(fsDriver, storageMeta);
    }

    private async withLock<T>(fn: () => Promise<T>): Promise<T> {
        await this.photoSync.aquireLock();
        try {
            const result = await fn();
            await this.photoSync.releaseLock();
            return result;
        }
        catch (e) {
            await this.photoSync.releaseLock();
            throw e;
        }
    }

    public async sync(hard = false) {
        if (hard) {
            await this.photoSync.hardSync();
        } else {
            await this.photoSync.softSync();
        }
    }

    public async archive() {
        await this.photoSync.archiveChanges();
    }

    async createPhotos(req: createPhoto_[]) {
        console.log('Creating photos..', req);
        const nextItemId = await this.photoSync.getNextItemId();
        const photos: createPhotoType[] = [];
        req.map(({ itemId, assetFileId, detail, mime, size }) => {
            const ind = itemId - nextItemId;
            photos[ind] = {
                metadata: JSON.stringify(detail.metadata),
                folderNo: this.assetManager.getFolderNoFromItemId(itemId),
                fileId: assetFileId,
                addedOn: new Date(),
                lastEditedOn: new Date(),
                mimeType: mime,
                itemId,
                capturedOn: detail.capturedOn,
                width: detail.width || null,
                height: detail.height || null,
                size,
                duration: detail.duration || null,
                originDevice: detail.metadata ? detail.metadata.cameraModel : null,
            } as createPhotoType;
        });
        await this.photoSync.addItems(photos);
        await this.photoSync.applyNewActions();
    }

    public async importPhotos(fileIds: string[], deleteSource = false) {
        await this.photoSync.softSync();
        return this.withLock(async () => {
            const nextItemId = await this.photoSync.getNextItemId();
            const req: createPhoto_[] = [];
            const promises = fileIds.map(async (fileId, index) => {
                const itemId = nextItemId + index;
                const assetFileId = await this.assetManager.importAsset(itemId, fileId, deleteSource);
                const [fileStream, mime] = await this.fsDriver.readFile(assetFileId);
                const detail = await this.assetManager.generateDetail(fileStream, mime);
                req.push({
                    itemId,
                    assetFileId,
                    detail,
                    mime,
                    size: (await this.fsDriver.getStat(fileId)).size || 0,
                });
            });
            await Promise.all(promises);
            await this.createPhotos(req);
        });
    }

    public async updateAsset(itemId: number, file: ApiRequestFile) {
        console.log('updateAsset', itemId, file)
        await this.photoSync.softSync();
        const photo = await Photo.getPhoto(itemId, this.storage);
        if (!photo) {
            throw new Error('Photo not found');
        }
        return this.withLock(async () => {
            let detail!: AssetDetailType;
            let assetFile!: RemoteItem;
            const stream = cloneStream(file.stream as ReadStream);
            const writeAsset = async () => {
                assetFile = await this.assetManager.updateAsset(photo.folderNo, itemId, stream, file.mime);
            };
            const getDetail = async () => {
                detail = await this.assetManager.generateDetail(stream.clone(), file.mime);
            };
            await Promise.all([writeAsset(), getDetail()]);
            const update: any = {
                lastEditedOn: new Date(),
            }

            if (detail) {
                if (!!detail.duration && detail.duration !== photo.duration) {
                    update.duration = detail.duration;
                }
                if (!!detail.width && detail.width !== photo.width) {
                    update.width = detail.width;
                }
                if (!!detail.height && detail.height !== photo.height) {
                    update.height = detail.height;
                }
            }
            if (assetFile && assetFile.size !== photo.size) {
                update.size = assetFile.size;
            }

            await this.photoSync.updateItems({
                [itemId]: update,
            })
            await this.photoSync.applyNewActions();
        });
    }

    public async deletePhotos(itemIds: number[]) {
        await this.photoSync.softSync();
        return this.withLock(async () => {
            const ids: number[] = [];
            const photos = await Photo.getPhotosByIds(itemIds, this.storage);
            const promises = photos.map(async (photo) => {
                await this.assetManager.delete(photo.folderNo, photo.itemId);
                ids.push(photo.itemId);
            });
            await Promise.all(promises);
            await this.photoSync.deleteItems(ids);
            await this.photoSync.applyNewActions();
        });
    }

    public async getPhotoDetails(itemId: number) {
        return Photo.getPhoto(itemId, this.storage);
    }

    public async getPhotoAsset(itemId: number, folderNo: number) {
        return this.assetManager.getAsset(folderNo, itemId);
    }

    public async listPhotos(limit: number, offset: number, orderBy: string, ascending = true) {
        return Photo.getPhotos(limit, offset, this.storage, orderBy, ascending);
    }
}
