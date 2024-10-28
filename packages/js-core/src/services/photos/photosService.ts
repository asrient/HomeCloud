import { FsDriver, RemoteItem } from "../../storageKit/interface";
import { Storage, createPhotoType, Photo, getPhotosParams, Profile } from "../../models";
import { ApiRequestFile } from "../../interface";
import AssetManager from "./assetManager";
import { AssetDetailType } from "./metadata";
import { apiFileToTempFile, removeTempFile } from "../../utils/fileUtils";
import { StorageType } from "../../envConfig";

export type SimpleActionSetType = {
  add: { [itemId: number]: any };
  delete: number[];
  update: { [itemId: number]: any };
};

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
  reqs: createPhoto_[] = [];
  errors: { [itemId: number]: string } = {};

  constructor(photoService: PhotosService) {
    this.photoService = photoService;
  }

  async getNextItemId() {
    return Profile.provisionPhotoIdsBatched(this.photoService.profile, 1);
  }

  public async addPhotoFromFile(filePath: string, mimeType: string): Promise<boolean> {
    let assetFile: RemoteItem | null = null;
    let detail: AssetDetailType | null = null;
    const itemId = await this.getNextItemId();
    console.log("Adding photo ITEM ID:", itemId);
    const getDetail = async () => {
      detail = await this.photoService.assetManager.generateDetail(
        filePath,
        mimeType,
      );
    };
    const getAssetFileId = async () => {
      assetFile = await this.photoService.assetManager.createAsset(
        itemId,
        filePath,
        mimeType,
      );
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
      return {
        addCount: 0,
        errors: this.errors,
        photos: [],
      };
    }
    const created = await this.photoService.createPhotos(this.reqs);
    return {
      photos: created.map((photo) => photo.getMinDetails()),
      addCount: Object.keys(created).length,
      errors: this.errors,
    };
  }
}

export default class PhotosService {
  fsDriver: FsDriver;
  storage: Storage;
  profile: Profile;
  assetManager: AssetManager;

  constructor(fsDriver: FsDriver) {
    this.fsDriver = fsDriver;
    this.storage = fsDriver.storage;
    this.profile = fsDriver.profile;
    if (this.storage.type !== StorageType.Local) {
      throw new Error(`Cannot use Photos on this storage type: ${this.storage.type}`);
    }
    this.assetManager = new AssetManager(fsDriver);
  }

  // private async pushServerEvent(type: "delta" | "purge", data: any) {
  //   const e: ServerEvent = {
  //     type: `photos.${type}`,
  //     data,
  //     profileId: this.storage.ProfileId,
  //   };
  //   await pushServerEvent(e);
  // }

  // async pushDeltaEvent(simpleActions: SimpleActionSetType) {
  //   await this.pushServerEvent("delta", {
  //     updates: simpleActions,
  //   });
  // }

  async addItemsToDb(items: { [itemId: number]: createPhotoType }) {
    const photos: createPhotoType[] = Object.keys(items).map((itemId) => {
      return {
        ...items[parseInt(itemId)],
        itemId: parseInt(itemId),
      };
    });
    return Photo.createPhotosBulk(photos, this.profile);
  }

  async createPhotos(req: createPhoto_[]) {
    const photos_: { [itemId: number]: createPhotoType } = [];
    req.forEach(({ itemId, assetFileId, detail, mime, size }) => {
      photos_[itemId] = {
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
    const photos = await this.addItemsToDb(photos_);
    const added = {};
    photos.forEach((photo) => {
      added[photo.itemId] = photo.getMinDetails();
    });
    // await this.pushDeltaEvent({
    //   add: added,
    //   update: {},
    //   delete: [],
    // });
    return photos;
  }

  public async importPhotos(fileIds: string[], deleteSource = false) {
    const nextItemId = await Profile.provisionPhotoIdsWithRetry(this.profile, fileIds.length);
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
    const photos = await this.createPhotos(req);
    return {
      photos: photos.map((photo) => photo.getMinDetails()),
      addCount: Object.keys(photos).length,
      errors,
    };
  }

  async deleteItemsFromDb(itemIds: number[]) {
    return Photo.deletePhotos(itemIds, this.profile);
  }

  async updateItemsInDb(items: { [itemId: number]: any }) {
    return Photo.updateBulk(items, this.profile);
  }

  public async updateAsset(itemId: number, file: ApiRequestFile): Promise<Photo> {
    const photo = await Photo.getPhoto(itemId, this.profile);
    if (!photo) {
      throw new Error("Photo not found");
    }
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

    const updatedPhotos = await this.updateItemsInDb({
      [itemId]: update,
    });
    // await this.pushDeltaEvent({
    //   add: {},
    //   update: {
    //     [itemId]: updatedPhotos[0]?.getMinDetails(),
    //   },
    //   delete: [],
    // });
    removeTempFile(filePath);
    return updatedPhotos[0];
  }

  public async deletePhotos(itemIds: number[]) {
    const ids: number[] = [];
    const errors: { [itemId: number]: string } = {};
    const photos = await Photo.getPhotosByIds(itemIds, this.profile);
    const promises = photos.map(async (photo) => {
      try {
        await this.assetManager.delete(photo.fileId);
        ids.push(photo.itemId);
      } catch (e: any) {
        errors[photo.itemId] = e.message;
      }
    });
    await Promise.all(promises);
    const count = await this.deleteItemsFromDb(ids);
    // await this.pushDeltaEvent({
    //   add: {},
    //   update: {},
    //   delete: ids,
    // });
    return {
      deleteCount: count,
      errors,
      deletedIds: ids,
    };
  }

  public async getPhotoDetails(itemId: number) {
    const photo = await Photo.getPhoto(itemId, this.profile);
    if (!photo) {
      throw new Error("Photo not found");
    }
    return photo.getDetails();
  }
}
