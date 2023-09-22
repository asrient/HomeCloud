import { FsDriver } from "../../storageKit/interface";
import { Storage, StorageMeta } from "../../models";
import { metaFromPhotoStream, metaFromVideoStream, AssetDetailType } from "./metadata";
import { ReadStream } from "original-fs";
import { Readable } from "stream";

const PHOTOS_PER_FOLDER = 120;

class PathStore {
    storageMeta: StorageMeta;
    assetFolderIds = new Map<number, string>();
    fsDriver: FsDriver;
    constructor(storageMeta: StorageMeta, fsDriver: FsDriver) {
        this.storageMeta = storageMeta;
        this.fsDriver = fsDriver;
    }

    public async getAssetParentFolderId(folderNo: number) {
        if (this.assetFolderIds.has(folderNo)) {
            return this.assetFolderIds.get(folderNo)!;
        }
        const dir = await this.fsDriver.makeOrGetDir(folderNo.toString(), this.storageMeta.photosAssetsDir);
        this.assetFolderIds.set(folderNo, dir.id);
        return dir.id;
    }
}


export default class AssetManager {
    fsDriver: FsDriver;
    storage: Storage;
    paths: PathStore;

    constructor(fsDriver: FsDriver, storageMeta: StorageMeta) {
        this.fsDriver = fsDriver;
        this.storage = fsDriver.storage;
        this.paths = new PathStore(storageMeta, fsDriver);
    }

    public async getAssetFileId(folderNo: number, itemId: number) {
        const parentFolderId = await this.paths.getAssetParentFolderId(folderNo);
        const stat = await this.fsDriver.getStatByFilename(itemId.toString(), parentFolderId);
        return stat.id;
    }

    public async getAsset(folderNo: number, itemId: number): Promise<[ReadStream, string]> {
        const [stream, mimeType] = await this.fsDriver.readFile(await this.getAssetFileId(folderNo, itemId));
        return [stream, mimeType];
    }

    public async createAsset(itemId: number, stream: Readable, mimeType: string) {
        const folderNo = this.getFolderNoFromItemId(itemId);
        const parentFolderId = await this.paths.getAssetParentFolderId(folderNo);
        const stat = await this.fsDriver.writeFile(parentFolderId, {
            name: itemId.toString(),
            mime: mimeType,
            stream: stream,
        });
        return stat;
    }

    public async importAsset(itemId: number, fileId: string, deleteSource = false) {
        const folderNo = this.getFolderNoFromItemId(itemId);
        const assetParentId = await this.paths.getAssetParentFolderId(folderNo);
        const stat = await this.fsDriver.moveFile(fileId, assetParentId, itemId.toString(), deleteSource);
        return stat.id;
    }

    public async updateAsset(folderNo: number, itemId: number, stream: Readable, mimeType: string) {
        const fileId = await this.getAssetFileId(folderNo, itemId);
        const stat = await this.fsDriver.updateFile(fileId, {
            name: itemId.toString(),
            mime: mimeType,
            stream: stream,
        });
        return stat;
    }

    public async delete(folderNo: number, itemId: number) {
        await this.fsDriver.unlink(await this.getAssetFileId(folderNo, itemId));
    }

    public async generateDetail(stream: Readable, mimeType: string): Promise<AssetDetailType> {
        if (mimeType.startsWith('image')) {
            return await metaFromPhotoStream(stream);
        } else if (mimeType.startsWith('video')) {
            return await metaFromVideoStream(stream);
        } else {
            throw new Error(`Unknown mime type ${mimeType}`);
        }
    }

    public getFolderNoFromItemId(itemId: number) {
        const folderNo = Math.floor(itemId / PHOTOS_PER_FOLDER);
        return folderNo;
    }
}
