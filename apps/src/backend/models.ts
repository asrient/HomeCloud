import { Sequelize, Op, DataTypes, Model, ModelAttributes, ModelIndexesOptions } from "sequelize";
import {
  envConfig,
  OptionalType,
  StorageType,
  StorageTypes,
  StorageAuthType,
  StorageAuthTypes,
  StorageTypeMeta,
} from "./envConfig";
import bcrypt from "bcrypt";
import {
  validateUsernameString,
  validatePasswordString,
  validateNameString,
} from "./utils/profileUtils";
import { createHash } from "./utils";
import CustomError from "./customError";
import path from "path";
import fs from "fs/promises";
import { isUrlPrivate } from "./utils/privateUrlChecker";

const saltRounds = 10;
const DAYS_5 = 5 * 24 * 60 * 60 * 1000;

class DbModel extends Model {
  static _columns: ModelAttributes;
  static _indexes?: ModelIndexesOptions[];

  get json() {
    return this.toJSON();
  }

  static register(db: Sequelize) {
    const opts: any = { sequelize: db };
    if (this._indexes) opts.indexes = this._indexes;
    super.init(this._columns, opts);
  }
}

export class Profile extends DbModel {
  declare id: number;
  declare username: string;
  declare name: string;
  declare isAdmin: boolean;
  declare hash: string;
  declare isDisabled: boolean;
  declare getStorages: () => Promise<Storage[]>;

  static _columns: ModelAttributes = {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING,
      unique: true,
      validate: {
        isLowercase: true,
        notEmpty: true,
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    hash: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
      },
    },
    isDisabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  };

  getDetails() {
    return {
      id: this.id,
      username: this.username,
      name: this.name,
      isAdmin: this.isAdmin,
      isPasswordProtected: this.isPasswordProtected(),
      isDisabled: this.isDisabled,
    };
  }

  async validatePassword(password: string) {
    if (!this.isPasswordProtected()) return true;
    if (!password) return false;
    return bcrypt.compare(password, this.hash);
  }

  isPasswordProtected() {
    return !!this.hash;
  }

  getStorageById(id: number) {
    return Storage.findOne({ where: { id, ProfileId: this.id } });
  }

  del() {
    return this.destroy();
  }

  static async getProfileByUsername(username: string) {
    return Profile.findOne({ where: { username } });
  }

  static async getProfileById(id: number) {
    return Profile.findByPk(id);
  }

  static async getProfiles(offset: number, limit: number) {
    return Profile.findAll({ offset, limit });
  }

  static async countProfiles() {
    return Profile.count();
  }

  static async createProfile(
    username: string | null,
    name: string,
    password: string | null = null,
  ) {
    let hash: string | null = null;
    if (!envConfig.PROFILES_CONFIG.allowSignups) {
      throw CustomError.security("Signups are disabled");
    }
    if (
      !password &&
      envConfig.PROFILES_CONFIG.passwordPolicy === OptionalType.Required
    ) {
      throw CustomError.validationSingle("password", "Password is required");
    }
    if (envConfig.PROFILES_CONFIG.requireUsername && !username) {
      throw CustomError.validationSingle("username", "Username is required");
    }

    name = validateNameString(name);

    if (!!username) {
      username = validateUsernameString(username);
    } else {
      username = null;
    }

    if (!!password) {
      if (envConfig.PROFILES_CONFIG.passwordPolicy === OptionalType.Disabled) {
        throw CustomError.validationSingle(
          "password",
          "Passwords are disabled",
        );
      }
      password = validatePasswordString(password);
      hash = await bcrypt.hash(password, saltRounds);
    }

    let isAdmin =
      envConfig.PROFILES_CONFIG.adminIsDefault ||
      (await Profile.countProfiles()) === 0;
    return await Profile.create({ username, name, hash, isAdmin });
  }

  async edit({
    username,
    name,
    password,
    isDisabled,
  }: {
    username?: string;
    name?: string;
    password?: string;
    isDisabled?: boolean;
  }) {
    if (username) {
      username = validateUsernameString(username);
    }
    if (password) {
      password = validatePasswordString(password);
      this.hash = await bcrypt.hash(password, saltRounds);
    }
    if (name) this.name = name;
    if (username) this.username = username;
    if (isDisabled !== undefined) this.isDisabled = isDisabled;
    return this.save();
  }

  static async deleteProfiles(ids: number[]) {
    return Profile.destroy({ where: { id: ids } });
  }
}

export type CreateStorageType = {
  type: StorageType;
  name: string;
  authType: StorageAuthType;
  oneAuthId: string | null;
  username: string | null;
  secret: string | null;
  url: string | null;
};

export type EditStorageType = {
  authType?: StorageAuthType;
  name?: string;
  username?: string;
  secret?: string;
  url?: string;
};

export class Storage extends DbModel {
  declare id: number;
  declare name: string;
  declare type: StorageType;
  declare oneAuthId: string | null;
  declare username: string | null;
  declare url: string | null;
  declare secret: string | null;
  declare accessToken: string | null;
  declare accessTokenExpiresOn: Date | null;
  declare authType: StorageAuthType;
  declare ProfileId: number;
  declare setProfile: (profile: Profile) => Promise<void>;
  declare getProfile: () => Promise<Profile>;

  static _columns: ModelAttributes = {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    oneAuthId: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
      },
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
      },
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
      },
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: false,
      },
      get(this: Storage): string | null {
        // todo: decrypt secret here
        return this.getDataValue("secret");
      },
      set(this: Storage, value: string | null) {
        // todo: encrypt secret here
        this.setDataValue("secret", value);
      },
    },
    accessToken: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: false,
      },
    },
    accessTokenExpiresOn: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    authType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
  };

  async getDetails() {
    const storageMeta = await this.getStorageMeta();
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      authType: this.authType,
      url: this.url,
      username: this.username,
      oneAuthId: this.oneAuthId,
      storageMeta: storageMeta?.getDetails() || null,
    };
  }

  async delete() {
    return this.destroy();
  }

  async getStorageMeta() {
    return StorageMeta.getByStorage(this);
  }

  static async validateData(data: CreateStorageType) {
    if (!data.name) throw new Error("Name is required");
    if (!data.type || !StorageTypes.includes(data.type))
      throw new Error("Invalid storage type");
    if (!data.authType || !StorageAuthTypes.includes(data.authType))
      throw new Error("Invalid auth type");

    data.name = data.name.trim();
    data.url = data.url ? data.url.trim() : null;
    data.username = data.username ? data.username.trim() : null;
    data.secret = data.secret ? data.secret.trim() : null;
    data.oneAuthId = data.oneAuthId ? data.oneAuthId.trim() : null;

    if (data.name.length < 3)
      throw new Error("Name must be at least 3 characters long");
    if (data.authType !== StorageAuthType.OneAuth && !data.url)
      throw new Error("Url is required");

    const allowedAuthTypes = StorageTypeMeta[data.type].allowedAuthTypes;
    if (allowedAuthTypes && !allowedAuthTypes.includes(data.authType)) {
      throw new Error("Invalid auth type for this storage type");
    }

    const allowedUrlProtocols = StorageTypeMeta[data.type].allowedUrlProtocols;
    if (allowedUrlProtocols && data.url) {
      const protocol = data.url.split("://")[0];
      if (!allowedUrlProtocols.includes(protocol)) {
        throw new Error("Invalid url protocol for this storage type");
      }
      if (data.url && !StorageTypeMeta[data.type].urlIsPath && !envConfig.ALLOW_PRIVATE_URLS) {
        try {
          if (await isUrlPrivate(data.url)) {
            throw new Error("Url domain is private");
          }
        } catch (e: any) {
          throw CustomError.validationSingle("url", e.message);
        }
      }
    }

    if (data.url && StorageTypeMeta[data.type].urlIsPath) {
      if (!path.isAbsolute(data.url)) {
        throw new Error(`Path must be absolute starting with: ${path.sep}`);
      }
      const stat = await fs.stat(data.url);
      if (!stat.isDirectory()) {
        throw new Error(`Path must be a directory`);
      }
    }

    switch (data.authType) {
      case StorageAuthType.OneAuth:
        if (!data.oneAuthId)
          throw new Error("oneAuthId is required for oneauth");
        data.url = null;
        data.username = null;
        break;
      case StorageAuthType.None:
        data.username = null;
        data.secret = null;
        data.oneAuthId = null;
        break;
      case StorageAuthType.Basic:
        if (!data.username || !data.username.length)
          throw new Error("Username is required for basic auth");
        if (!data.secret)
          throw new Error("Password is required for basic auth");
        data.oneAuthId = null;
        break;
      case StorageAuthType.Digest:
        if (!data.username || !data.username.length)
          throw new Error("Username is required for digest auth");
        if (!data.secret)
          throw new Error("Password is required for digest auth");
        data.oneAuthId = null;
        break;
    }
  }

  async setAccessToken({
    accessToken,
    expiresOn,
  }: {
    accessToken: string;
    expiresOn: Date;
  }) {
    if (this.authType !== StorageAuthType.OneAuth)
      throw new Error("Cannot set access token for non oneauth storage");
    this.accessToken = accessToken;
    this.accessTokenExpiresOn = expiresOn;
    return this.save();
  }

  hasActiveAccessToken() {
    if (this.authType !== StorageAuthType.OneAuth)
      throw new Error("Cannot check access token for non oneauth storage");
    if (!this.accessToken || !this.accessTokenExpiresOn) return false;
    return this.accessTokenExpiresOn > new Date();
  }

  async edit({ authType, name, username, secret, url }: EditStorageType) {
    this.name = name || this.name;
    this.username = username || this.username;
    this.secret = secret || this.secret;
    this.url = url || this.url;

    if (authType) {
      if (
        this.authType !== StorageAuthType.OneAuth &&
        authType === StorageAuthType.OneAuth
      ) {
        throw new Error("Cannot change auth type to oneauth");
      }
      if (
        this.authType === StorageAuthType.OneAuth &&
        authType !== StorageAuthType.OneAuth
      ) {
        throw new Error("Cannot change auth type from oneauth");
      }
      if (!StorageAuthTypes.includes(authType))
        throw new Error("Invalid auth type");
      this.authType = authType;
    }

    await Storage.validateData(this);

    const existing = await Storage.getExisting({
      profile: await this.getProfile(),
      authType: this.authType,
      username: this.username,
      url: this.url,
      oneAuthId: this.oneAuthId,
    });
    if (existing && existing.id !== this.id) {
      throw new Error("Storage with target already exists for this profile");
    }
    return this.save();
  }

  static async getExisting({
    profile,
    authType,
    username,
    url,
    oneAuthId,
  }: {
    profile: Profile;
    authType: StorageAuthType;
    username: string | null;
    url: string | null;
    oneAuthId: string | null;
  }) {
    const where: any = { ProfileId: profile.id };
    if (authType === StorageAuthType.OneAuth) {
      if (!oneAuthId) throw new Error("oneAuthId is required");
      where.oneAuthId = oneAuthId;
      return await this.findOne({ where });
    } else {
      if (!url) throw new Error("url is required");
      where.url = url;
      where.username = username;
      return await this.findOne({ where });
    }
  }

  static async createStorage(profile: Profile, data: CreateStorageType) {
    if (!profile) throw new Error("Profile is required to create storage");
    await Storage.validateData(data);

    const existing = await Storage.getExisting({
      profile,
      authType: data.authType,
      username: data.username,
      url: data.url,
      oneAuthId: data.oneAuthId,
    });
    if (existing) {
      if (data.authType !== StorageAuthType.OneAuth) {
        throw new Error("Storage with target already exists for this profile");
      }
      existing.secret = data.secret;
      return existing.save();
    }
    const storage = await Storage.create(data);
    await storage.setProfile(profile);
    return storage;
  }

  static async getById(id: number) {
    return Storage.findByPk(id);
  }

  static async getStoragesForProfile(profile: Profile, storageIds: number[], onlyIds = false) {
    const storages = await Storage.findAll({
      where: { id: storageIds, profile },
      include: {
        attributes: onlyIds ? ["id"] : undefined
      }
    });
    return storages;
  }
}

export class PendingAuth extends DbModel {
  declare id: number;
  declare referenceId: string;
  declare partialCode1: string;
  declare storageType: StorageType;
  declare expiresOn: Date;
  declare setProfile: (profile: Profile) => Promise<void>;
  declare getProfile: () => Promise<Profile>;

  static _indexes: ModelIndexesOptions[] = [
    { unique: true, fields: ['referenceId', 'ProfileId'] }
  ];

  static _columns: ModelAttributes = {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    referenceId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    partialCode1: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    storageType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    expiresOn: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  };

  getDetails() {
    return {
      id: this.id,
      referenceId: this.referenceId,
      storageType: this.storageType,
      expiresOn: this.expiresOn,
    };
  }

  makeSecret(partialCode2: string) {
    return createHash(this.partialCode1 + partialCode2);
  }

  async createStorage({
    oneAuthId,
    partialCode2,
  }: {
    oneAuthId: string;
    partialCode2: string;
  }) {
    const profile = await this.getProfile();
    if (!profile) throw new Error("Profile not found");
    const secret = this.makeSecret(partialCode2);
    const storage = await Storage.createStorage(profile, {
      type: this.storageType,
      name: StorageTypeMeta[this.storageType].name,
      authType: StorageAuthType.OneAuth,
      oneAuthId,
      secret,
      url: null,
      username: null,
    });
    await this.destroy();
    return storage;
  }

  static async createPendingAuth({
    profile,
    storageType,
    referenceId,
    partialCode1,
  }: {
    profile: Profile;
    storageType: StorageType;
    referenceId: string;
    partialCode1: string;
  }) {
    const expiresOn = new Date(Date.now() + 60 * 60 * 1000);
    const pendingAuth = await PendingAuth.create({
      storageType,
      referenceId,
      expiresOn,
      partialCode1,
    });
    await pendingAuth.setProfile(profile);
    return pendingAuth;
  }

  static async getByReferenceId(referenceId: string) {
    return PendingAuth.findOne({ where: { referenceId } });
  }

  static async clearExpired() {
    return PendingAuth.destroy({
      where: { expiresOn: { [Op.lt]: new Date() } },
    });
  }
}

export class StorageMeta extends DbModel {
  declare id: number;
  declare hcRoot: string;
  declare notesDir: string;
  declare photosDir: string;
  declare photosAssetsDir: string;
  declare photosLastSyncOn: number;
  declare photosSyncLockOn: Date | null;
  declare isPhotosEnabled: boolean;
  declare isNotesEnabled: boolean;
  declare setStorage: (storage: Storage) => Promise<void>;
  declare getStorage: () => Promise<Storage>;

  static _columns: ModelAttributes = {
    hcRoot: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },

    notesDir: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },

    photosDir: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    photosAssetsDir: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },

    photosLastSyncOn: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },

    isPhotosEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    isNotesEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    photosSyncLockOn: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  };

  getDetails() {
    return {
      id: this.id,
      hcRoot: this.hcRoot,
      notesDir: this.notesDir,
      photosDir: this.photosDir,
      photosAssetsDir: this.photosAssetsDir,
      photosLastSyncOn: this.photosLastSyncOn,
      isPhotosEnabled: this.isPhotosEnabled,
      isNotesEnabled: this.isNotesEnabled,
    };
  }

  async del() {
    return this.destroy();
  }

  static async getByStorage(storage: Storage) {
    const storageMeta = await StorageMeta.findOne({
      where: { StorageId: storage.id },
    });
    return storageMeta;
  }

  static async createOrUpdate(
    storage: Storage,
    data: {
      hcRoot: string;
      notesDir: string;
      photosDir: string;
      photosAssetsDir: string;
    },
  ) {
    let storageMeta = await StorageMeta.getByStorage(storage);
    if (!storageMeta) {
      storageMeta = await StorageMeta.create(data);
      await storageMeta.setStorage(storage);
    } else {
      await storageMeta.update(data);
    }
    return storageMeta;
  }
}

export class Photo extends DbModel {
  declare setStorage: (storage: Storage) => Promise<void>;
  declare getStorage: () => Promise<Storage>;
  declare itemId: number;
  declare folderNo: number;
  declare fileId: string;
  declare mimeType: string;
  declare capturedOn: Date;
  declare lastEditedOn: Date;
  declare addedOn: Date;
  declare size: number;
  declare duration: number | null;
  declare height: number;
  declare width: number;
  declare originDevice: string | null;
  declare metadata: string | null;
  declare StorageId: number;

  static _indexes: ModelIndexesOptions[] = [
    { unique: true, fields: ['itemId', 'StorageId'] }
  ];

  static _columns: ModelAttributes = {
    itemId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    folderNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fileId: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    capturedOn: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastEditedOn: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    addedOn: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    originDevice: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  };

  getDetails() {
    return this.toJSON();
  }

  getMinDetails() {
    return {
      itemId: this.itemId,
      folderNo: this.folderNo,
      fileId: this.fileId,
      mimeType: this.mimeType,
      capturedOn: this.capturedOn,
      addedOn: this.addedOn,
      duration: this.duration,
      height: this.height,
      width: this.width,
      storageId: this.StorageId,
    };
  }

  static async getPhoto(itemId: number, storage: Storage) {
    return Photo.findOne({ where: { itemId, StorageId: storage.id } });
  }

  static async getPhotosByIds(itemIds: number[], storage: Storage) {
    return Photo.findAll({ where: { itemId: itemIds, StorageId: storage.id } });
  }

  static async updateBulk(
    updates: { [itemId: number]: any },
    storage: Storage,
  ) {
    const promises = [];
    for (const itemId of Object.keys(updates).map((id) => parseInt(id))) {
      const update = updates[itemId];
      if (update.StorageId) delete update.StorageId;
      if (update.itemId) delete update.itemId;
      if (update.folderNo) delete update.folderNo;
      if (update.addedOn) delete update.addedOn;
      promises.push(
        Photo.update(update, { where: { itemId, StorageId: storage.id } }),
      );
    }
    return Promise.all(promises);
  }

  static async deletePhotos(itemIds: number[], storage: Storage) {
    return Photo.destroy({ where: { itemId: itemIds, StorageId: storage.id } });
  }

  static async deleteAllPhotos(storage: Storage) {
    return Photo.destroy({ where: { StorageId: storage.id } });
  }

  static async getPhotos({ offset, limit, storageIds, sortBy, ascending = true }: getPhotosParams): Promise<Photo[]> {
    return Photo.findAll({
      where: { StorageId: storageIds },
      offset,
      limit,
      order: [[sortBy, ascending ? "ASC" : "DESC"]],
    });
  }

  static async createPhotosBulk(items: createPhotoType[], storage: Storage) {
    items = items.map((item) => {
      return { ...item, StorageId: storage.id };
    });
    return Photo.bulkCreate(items);
  }
}

export type getPhotosParams = {
  offset: number,
  limit: number,
  storageIds: number[],
  sortBy: string,
  ascending: boolean,
};

export type createPhotoType = {
  itemId: number;
  folderNo: number;
  fileId: string;
  mimeType: string;
  capturedOn: Date;
  lastEditedOn: Date;
  addedOn: Date;
  size: number;
  duration: number | null;
  height: number | null;
  width: number | null;
  originDevice: string | null;
  metadata: string | null;
};

export class Thumb extends DbModel {
  declare setStorage: (storage: Storage) => Promise<void>;
  declare getStorage: () => Promise<Storage>;
  declare fileId: string;
  declare mimeType: string;
  declare updatedAt: Date;
  declare height: number | null;
  declare width: number | null;
  declare image: string;
  declare lastReadOn: Date;
  declare StorageId: number;

  static _indexes: ModelIndexesOptions[] = [
    { unique: true, fields: ['fileId', 'StorageId'] }
  ];

  static _columns: ModelAttributes = {
    fileId: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    image: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    lastReadOn: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  };

  getDetails() {
    return {
      fileId: this.fileId,
      updatedAt: this.updatedAt,
      image: this.image,
      height: this.height,
      width: this.width,
    };
  }

  isUpToDate(fileLastModified: Date) {
    return this.updatedAt >= fileLastModified;
  }

  async updateThumb({
    mimeType,
    height,
    width,
    image,
  }: {
    mimeType?: string;
    height?: number | null;
    width?: number | null;
    image: string;
  }) {
    this.mimeType = mimeType || this.mimeType;
    this.height = height || this.height;
    this.width = width || this.width;
    this.image = image;
    this.lastReadOn = new Date();
    return this.save();
  }

  static async getThumb(fileId: string, storage: Storage) {
    const thumb = await Thumb.findOne({
      where: { fileId, StorageId: storage.id },
    });
    if (!thumb) return null;
    thumb.lastReadOn = new Date();
    thumb.save(); // not waiting for save to complete
    return thumb;
  }

  static async createThumb(
    {
      fileId,
      mimeType,
      height,
      width,
      image,
    }: {
      fileId: string;
      mimeType: string;
      height: number | null;
      width: number | null;
      image: string;
    },
    storage: Storage,
  ) {
    return Thumb.create({
      fileId,
      mimeType,
      height,
      width,
      image,
      StorageId: storage.id,
    });
  }

  static async deleteThumbs(fileIds: string[], storage: Storage) {
    return Thumb.destroy({ where: { fileId: fileIds, StorageId: storage.id } });
  }

  static async removeOldThumbs() {
    const now = new Date();
    const expired = new Date(now.getTime() - DAYS_5 * 4); // 20 days
    return Thumb.destroy({ where: { lastReadOn: { [Op.lt]: expired } } });
  }
}

export class PinnedFolders extends DbModel {
  declare id: number;
  declare folderId: string;
  declare name: string;
  declare StorageId: number;
  declare setStorage: (storage: Storage) => Promise<void>;
  declare getStorage: () => Promise<Storage>;

  static _indexes: ModelIndexesOptions[] = [
    { unique: true, fields: ['folderId', 'StorageId'] }
  ];

  static _columns: ModelAttributes = {
    folderId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  };

  getDetails() {
    return {
      id: this.id,
      folderId: this.folderId,
      name: this.name,
      storageId: this.StorageId,
    };
  }

  static async getPinnedFolders(storages: Storage[]) {
    return PinnedFolders.findAll({
      where: { StorageId: storages.map((s) => s.id) },
    });
  }

  static async addPinnedFolder(
    storage: Storage,
    folderId: string,
    name: string,
  ) {
    const existing = await PinnedFolders.findOne({
      where: { folderId, StorageId: storage.id },
    });
    if (existing) {
      existing.name = name;
      return existing.save();
    }
    return PinnedFolders.create({ folderId, name, StorageId: storage.id });
  }

  static async removePinnedFolder(storage: Storage, folderId: string) {
    return PinnedFolders.destroy({
      where: { folderId, StorageId: storage.id },
    });
  }
}

export function initModels(db: Sequelize) {
  const classes = [
    Profile,
    Storage,
    PendingAuth,
    StorageMeta,
    Photo,
    Thumb,
    PinnedFolders,
  ];
  for (const cls of classes) {
    cls.register(db);
  }

  Profile.hasMany(Storage, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  Storage.belongsTo(Profile);

  Storage.hasOne(StorageMeta, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  StorageMeta.belongsTo(Storage);

  Profile.hasMany(PendingAuth, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  PendingAuth.belongsTo(Profile);

  Storage.hasMany(Photo, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  Photo.belongsTo(Storage);

  Storage.hasMany(Thumb, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  Thumb.belongsTo(Storage);

  Storage.hasMany(PinnedFolders, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  PinnedFolders.belongsTo(Storage);
}
