import { FsDriver } from "../../storageKit/interface";
import { Storage, StorageMeta } from "../../models";
import {
  metaFromPhotoStream,
  metaFromVideoStream,
  AssetDetailType,
} from "./metadata";
import { ReadStream } from "original-fs";
import { Readable } from "stream";
import mime from "mime";
import fs from "fs";

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
    const dir = await this.fsDriver.makeOrGetDir(
      folderNo.toString(),
      this.storageMeta.photosAssetsDir,
    );
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

  private itemIdToFilename(itemId: number, mimeType: string) {
    return `${itemId}.${mime.getExtension(mimeType)}`;
  }

  public async getAsset(
    fileId: string,
  ): Promise<[ReadStream, string]> {
    return await this.fsDriver.readFile(fileId);
  }

  public async createAsset(itemId: number, filePath: string, mimeType: string) {
    const folderNo = this.getFolderNoFromItemId(itemId);
    const parentFolderId = await this.paths.getAssetParentFolderId(folderNo);
    const stream = fs.createReadStream(filePath);
    const stat = await this.fsDriver.writeFile(parentFolderId, {
      name: this.itemIdToFilename(itemId, mimeType),
      mime: mimeType,
      stream: stream,
    });
    return stat;
  }

  public async importAsset(
    itemId: number,
    fileId: string,
    mimeType: string,
    deleteSource = false,
  ) {
    const folderNo = this.getFolderNoFromItemId(itemId);
    const assetParentId = await this.paths.getAssetParentFolderId(folderNo);
    const stat = await this.fsDriver.moveFile(
      fileId,
      assetParentId,
      this.itemIdToFilename(itemId, mimeType),
      deleteSource,
    );
    return stat.id;
  }

  public async updateAsset(
    fileId: string,
    itemId: number,
    filePath: string,
    mimeType: string,
  ) {
    const stream = fs.createReadStream(filePath);
    const stat = await this.fsDriver.updateFile(fileId, {
      name: this.itemIdToFilename(itemId, mimeType),
      mime: mimeType,
      stream: stream,
    });
    return stat;
  }

  public async delete(fileId: string) {
    await this.fsDriver.unlink(fileId);
  }

  public async generateDetail(
    filePath: string | Readable,
    mimeType: string,
  ): Promise<AssetDetailType> {
    if (mimeType.startsWith("image")) {
      return await metaFromPhotoStream(filePath);
    } else if (mimeType.startsWith("video")) {
      return await metaFromVideoStream(filePath);
    } else {
      throw new Error(`Unknown mime type ${mimeType}`);
    }
  }

  public getFolderNoFromItemId(itemId: number) {
    const folderNo = Math.floor(itemId / PHOTOS_PER_FOLDER);
    return folderNo;
  }
}
