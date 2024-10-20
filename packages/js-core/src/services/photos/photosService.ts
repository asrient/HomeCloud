import { FsDriver, RemoteItem } from "../../storageKit/interface";
import { Storage, createPhotoType, Photo, getPhotosParams, StorageMeta } from "../../models";
import { ApiRequestFile } from "../../interface";
import AssetManager from "./assetManager";
import PhotoSync from "./photoSync";
import { AssetDetailType } from "./metadata";
import { pushServerEvent, ServerEvent } from "../../serverEvent";
import { SimpleActionSetType } from "../syncEngine";
import { apiFileToTempFile, removeTempFile } from "../../utils/fileUtils";

/**
 * photoNum format: [folderNo]/[itemId]
 * itemId is maintained globally (across all folders) and is auto increasing.
 */

type createPhoto_ = {
  itemId: number;
  assetFileId: string;
  detail: AssetDetailType;
  mime: string;
  size: number;
};

export class UploadManager {
  photoService: PhotosService;
  photoSync: PhotoSync;
  nextItemId: number;
  reqs: createPhoto_[] = [];
  errors: { [itemId: number]: string } = {};

  constructor(photoService: PhotosService) {
    this.photoService = photoService;
    this.photoSync = photoService.photoSync;
    this.nextItemId = -1;
  }

  getNextItemId() {
    const curr = this.nextItemId;
    this.nextItemId++;
    return curr;
  }

  public async start() {
    await this.photoSync.aquireLock();
    await this.photoService.softSyncAndPublish();
    this.nextItemId = await this.photoSync.getNextItemId();
  }

  public async addPhotoFromFile(filePath: string, mimeType: string): Promise<boolean> {
    const itemId = this.getNextItemId();
    let assetFile: RemoteItem | null = null;
    let detail: AssetDetailType | null = null;
    const getDetail = async () => {
      console.log("Generating metadata..", itemId, mimeType);
      detail = await this.photoService.assetManager.generateDetail(
        filePath,
        mimeType,
      );
      console.log("Generated metadata", itemId);
    };
    const getAssetFileId = async () => {
      console.log("Creating asset..", itemId, mimeType);
      assetFile = await this.photoService.assetManager.createAsset(
        itemId,
        filePath,
        mimeType,
      );
      console.log("Created asset", itemId, assetFile.id);
    };
    try {
      await Promise.all([getDetail(), getAssetFileId()]);
      this.reqs.push({
        itemId,
        mime: mimeType,
        assetFileId: assetFile!.id,
        detail: detail!,
        size: assetFile!.size || 0,
      });
      return true;
    } catch (e: any) {
      console.error("Error adding photo", e);
      this.errors[itemId] = e.message;
      return false;
    }
  }

  public async addPhoto(file: ApiRequestFile) {
    const filePath = await apiFileToTempFile(file);
    const result = await this.addPhotoFromFile(filePath, file.mime);
    if (!result && !file.stream.destroyed) {
      file.stream.resume();
      file.stream.on("end", () => {
        // dummy listener to make sure whole stream is consumed or else next stream may not begin in certain cases.
        console.log("Stream ended");
      });
    }
    removeTempFile(filePath);
  }

  public async end() {
    if (this.reqs.length === 0) {
      await this.photoSync.releaseLock();
      return {
        addCount: 0,
        errors: this.errors,
      };
    }
    try {
      const created = await this.photoService.createPhotos(this.reqs);
      await this.photoSync.releaseLock();
      return {
        addCount: Object.keys(created).length,
        errors: this.errors,
      };
    } catch (e) {
      await this.photoSync.releaseLock();
      throw e;
    }
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
    this.assetManager = new AssetManager(fsDriver);
    this.photoSync = new PhotoSync(fsDriver, storageMeta);
  }

  private async pushServerEvent(type: "delta" | "purge", data: any) {
    const e: ServerEvent = {
      type: `photos.${type}`,
      data,
      profileId: this.storage.ProfileId,
    };
    await pushServerEvent(e);
  }

  private async normalizeSimpleActions(simpleActions: SimpleActionSetType): Promise<SimpleActionSetType> {
    const add = simpleActions.add;
    const update = simpleActions.update;
    const del = simpleActions.delete;
    const normalized: SimpleActionSetType = {
      add: {},
      update: {},
      delete: [],
    };

    const addIds = Object.keys(add).map(Number);
    if (addIds.length) {
      const addPhotos = await Photo.getPhotosByIds(addIds, this.storage);
      addPhotos.forEach((photo) => {
        normalized.add[photo.itemId] = photo.getMinDetails();
      });
    }

    const updateIds = Object.keys(update).map(Number);
    if (updateIds.length) {
      const updatePhotos = await Photo.getPhotosByIds(updateIds, this.storage);
      updatePhotos.forEach((photo) => {
        normalized.update[photo.itemId] = photo.getMinDetails();
      });
    }

    normalized.delete = del;
    return normalized;
  }

  async pushDeltaEvent(simpleActions: SimpleActionSetType) {
    simpleActions = await this.normalizeSimpleActions(simpleActions);
    const lastSyncTime = await this.photoSync.getLastSyncTime();
    await this.pushServerEvent("delta", {
      updates: simpleActions,
      lastSyncTime,
    });
  }

  private async pushPurgeEvent() {
    const lastSyncTime = await this.photoSync.getLastSyncTime();
    await this.pushServerEvent("purge", {
      lastSyncTime,
    });
  }

  async softSyncAndPublish() {
    const simpleActions = await this.photoSync.softSync();
    if (!simpleActions) return;
    await this.pushDeltaEvent(simpleActions);
  }

  async hardSyncAndPublish(force = false) {
    await this.photoSync.hardSync(force);
    await this.pushPurgeEvent();
  }

  public async sync(hard = false, force = false) {
    return this.photoSync.withLock(async () => {
      if (hard) {
        await this.hardSyncAndPublish(force);
      } else {
        await this.softSyncAndPublish();
      }
    });
  }

  public async archive() {
    return this.photoSync.withLock(async () => {
      await this.softSyncAndPublish();
      await this.photoSync.archiveChanges();
    });
  }

  async createPhotos(req: createPhoto_[]) {
    console.log("Creating photos..", req);
    const photos: { [itemId: number]: createPhotoType } = [];
    req.map(({ itemId, assetFileId, detail, mime, size }) => {
      photos[itemId] = {
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
    this.photoSync.checkLock();
    const simpleActions = await this.photoSync.applyNewActions();
    this.photoSync.checkLock();
    await this.pushDeltaEvent(simpleActions);
    return simpleActions.add;
  }

  public async importPhotos(fileIds: string[], deleteSource = false) {
    return this.photoSync.withLock(async () => {
      await this.softSyncAndPublish();
      this.photoSync.checkLock();
      const nextItemId = await this.photoSync.getNextItemId();
      this.photoSync.checkLock();
      const req: createPhoto_[] = [];
      const errors: { [fileId: string]: string } = {};
      const promises = fileIds.map(async (fileId, index) => {
        const itemId = nextItemId + index;
        const stat = await this.fsDriver.getStat(fileId);
        if (!stat.mimeType) {
          throw new Error("Mime type not found for file.");
        }
        const assetFileId = await this.assetManager.importAsset(
          itemId,
          fileId,
          stat.mimeType,
          deleteSource,
        );
        const [fileStream, mime] = await this.fsDriver.readFile(assetFileId);
        this.photoSync.checkLock();
        const detail = await this.assetManager.generateDetail(fileStream, mime);
        if (!fileStream.destroyed) {
          fileStream.destroy();
        }
        req.push({
          itemId,
          assetFileId,
          detail,
          mime,
          size: (await this.fsDriver.getStat(fileId)).size || 0,
        });
      });
      await Promise.all(
        promises.map((p, ind) =>
          p.catch((e) => {
            errors[fileIds[ind]] = e.message;
          }),
        ),
      );
      this.photoSync.checkLock();
      if (req.length === 0) {
        return {
          addCount: 0,
          errors,
        };
      }
      const created = await this.createPhotos(req);
      return {
        addCount: Object.keys(created).length,
        errors,
      };
    });
  }

  public async updateAsset(itemId: number, file: ApiRequestFile) {
    return this.photoSync.withLock(async () => {
      console.log("updateAsset", itemId, file);
      await this.softSyncAndPublish();
      this.photoSync.checkLock();
      const photo = await Photo.getPhoto(itemId, this.storage);
      if (!photo) {
        throw new Error("Photo not found");
      }
      this.photoSync.checkLock();
      let detail!: AssetDetailType;
      let assetFile!: RemoteItem;
      const filePath = await apiFileToTempFile(file);
      const writeAsset = async () => {
        assetFile = await this.assetManager.updateAsset(
          photo.fileId,
          itemId,
          filePath,
          file.mime,
        );
      };
      const getDetail = async () => {
        detail = await this.assetManager.generateDetail(
          filePath,
          file.mime,
        );
      };
      await Promise.all([writeAsset(), getDetail()]);
      const update: any = {
        lastEditedOn: new Date(),
      };
      this.photoSync.checkLock();

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
      });
      const simpleActions = await this.photoSync.applyNewActions();
      await this.pushDeltaEvent(simpleActions);
      removeTempFile(filePath);
      return simpleActions.update[itemId];
    });
  }

  public async deletePhotos(itemIds: number[]) {
    return this.photoSync.withLock(async () => {
      await this.softSyncAndPublish();
      this.photoSync.checkLock();
      const ids: number[] = [];
      const errors: { [itemId: number]: string } = {};
      const photos = await Photo.getPhotosByIds(itemIds, this.storage);
      const promises = photos.map(async (photo) => {
        try {
          await this.assetManager.delete(photo.fileId);
          ids.push(photo.itemId);
        } catch (e: any) {
          errors[photo.itemId] = e.message;
        }
      });
      await Promise.all(promises);
      await this.photoSync.deleteItems(ids);
      const simpleActions = await this.photoSync.applyNewActions();
      await this.pushDeltaEvent(simpleActions);
      return {
        deleteCount: simpleActions.delete.length,
        errors,
      };
    });
  }

  public async getPhotoDetails(itemId: number) {
    const photo = await Photo.getPhoto(itemId, this.storage);
    if (!photo) {
      throw new Error("Photo not found");
    }
    return photo.getDetails();
  }
}
