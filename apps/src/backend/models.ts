import { Sequelize, Op, DataTypes, Model } from 'sequelize';
import { envConfig, OptionalType, StorageType, StorageTypes, StorageAuthType, StorageAuthTypes, StorageTypeMeta } from './envConfig';
import bcrypt from "bcrypt";
import { validateUsernameString, validatePasswordString } from './utils/profileUtils';
import { createHash } from './utils';

const saltRounds = 10;
const DAYS_5 = 5 * 24 * 60 * 60 * 1000;

class DbModel extends Model {
    static _columns: any;

    get json() {
        return this.toJSON();
    }

    static register(db: Sequelize) {
        super.init(this._columns, { sequelize: db });
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

    static _columns = {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                isLowercase: true,
                notEmpty: true,
            }
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
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
            }
        },
        isDisabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    }

    getDetails() {
        return {
            id: this.id,
            username: this.username,
            name: this.name,
            isAdmin: this.isAdmin,
            isPasswordProtected: this.isPasswordProtected(),
            isDisabled: this.isDisabled,
        }
    }

    async validatePassword(password: string) {
        if (!this.isPasswordProtected()) return true;
        return bcrypt.compare(password, this.hash);
    }

    isPasswordProtected() {
        return !!this.hash;
    }

    getStorageById(id: number) {
        return Storage.findOne({ where: { id, ProfileId: this.id } });
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

    static async createProfile(username: string, name: string, password: string | null = null) {
        let hash: string | null = null;
        if (!envConfig.PROFILES_CONFIG.allowSignups) {
            throw new Error('Signups are disabled');
        }
        if (!password && envConfig.PROFILES_CONFIG.passwordPolicy === OptionalType.Required) {
            throw new Error('Password is required');
        }
        const [valid, str] = validateUsernameString(username);
        if (!valid) {
            throw new Error(str);
        }
        username = str;
        if (!!password) {
            if (envConfig.PROFILES_CONFIG.passwordPolicy === OptionalType.Disabled) {
                throw new Error('Passwords are disabled');
            }
            const [valid, str] = validatePasswordString(password);
            if (!valid) {
                throw new Error(str);
            }
            password = str;
            hash = await bcrypt.hash(password, saltRounds);
        }

        let isAdmin = envConfig.PROFILES_CONFIG.adminIsDefault || await Profile.countProfiles() === 0;
        return await Profile.create({ username, name, hash, isAdmin });
    }
}

export type CreateStorageType = {
    type: StorageType,
    name: string,
    authType: StorageAuthType,
    oneAuthId: string | null,
    username: string | null,
    secret: string | null,
    url: string | null,
};

export type EditStorageType = {
    authType?: StorageAuthType,
    name?: string,
    username?: string,
    secret?: string,
    url?: string,
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

    static _columns = {
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
            }
        },
        oneAuthId: {
            type: DataTypes.STRING,
            allowNull: true,
            validate: {
                notEmpty: true,
            }
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
                return this.getDataValue('secret');
            },
            set(this: Storage, value: string | null) {
                // todo: encrypt secret here
                this.setDataValue('secret', value);
            }
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
            }
        },
    }

    getDetails() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            authType: this.authType,
        }
    }

    async delete() {
        return this.destroy();
    }

    async getStorageMeta() {
        return StorageMeta.getByStorage(this);
    }

    static async validateData(data: CreateStorageType) {
        if (!data.name) throw new Error('Name is required');
        if (!data.type || !StorageTypes.includes(data.type)) throw new Error('Invalid storage type');
        if (!data.authType || !StorageAuthTypes.includes(data.authType)) throw new Error('Invalid auth type');

        data.name = data.name.trim();
        data.url = data.url ? data.url.trim() : null;
        data.username = data.username ? data.username.trim() : null;
        data.secret = data.secret ? data.secret.trim() : null;
        data.oneAuthId = data.oneAuthId ? data.oneAuthId.trim() : null;

        if (data.name.length < 3) throw new Error('Name must be at least 3 characters long');
        if (data.authType !== StorageAuthType.OneAuth && !data.url) throw new Error('Url is required');

        const allowedAuthTypes = StorageTypeMeta[data.type].allowedAuthTypes;
        if (allowedAuthTypes && !allowedAuthTypes.includes(data.authType)) {
            throw new Error('Invalid auth type for this storage type');
        }

        const allowedUrlProtocols = StorageTypeMeta[data.type].allowedUrlProtocols;
        if (allowedUrlProtocols && data.url) {
            const protocol = data.url.split('://')[0];
            if (!allowedUrlProtocols.includes(protocol)) {
                throw new Error('Invalid url protocol for this storage type');
            }
        }

        switch (data.authType) {
            case StorageAuthType.OneAuth:
                if (!data.oneAuthId) throw new Error('oneAuthId is required for oneauth');
                data.url = null;
                data.username = null;
                break;
            case StorageAuthType.None:
                data.username = null;
                data.secret = null;
                data.oneAuthId = null;
                break;
            case StorageAuthType.Basic:
                if (!data.username || !data.username.length) throw new Error('Username is required for basic auth');
                if (!data.secret) throw new Error('Password is required for basic auth');
                data.oneAuthId = null;
                break;
            case StorageAuthType.Digest:
                if (!data.username || !data.username.length) throw new Error('Username is required for digest auth');
                if (!data.secret) throw new Error('Password is required for digest auth');
                data.oneAuthId = null;
                break;
        }
    }

    async setAccessToken({ accessToken, expiresOn }: { accessToken: string, expiresOn: Date }) {
        if (this.authType !== StorageAuthType.OneAuth) throw new Error('Cannot set access token for non oneauth storage');
        this.accessToken = accessToken;
        this.accessTokenExpiresOn = expiresOn;
        return this.save();
    }

    hasActiveAccessToken() {
        if (this.authType !== StorageAuthType.OneAuth) throw new Error('Cannot check access token for non oneauth storage');
        if (!this.accessToken || !this.accessTokenExpiresOn) return false;
        return this.accessTokenExpiresOn > new Date();
    }

    async edit({ authType, name, username, secret, url }: EditStorageType) {
        this.name = name || this.name;
        this.username = username || this.username;
        this.secret = secret || this.secret;
        this.url = url || this.url;

        if (authType) {
            if (this.authType !== StorageAuthType.OneAuth && authType === StorageAuthType.OneAuth) {
                throw new Error('Cannot change auth type to oneauth');
            }
            if (this.authType === StorageAuthType.OneAuth && authType !== StorageAuthType.OneAuth) {
                throw new Error('Cannot change auth type from oneauth');
            }
            if (!StorageAuthTypes.includes(authType)) throw new Error('Invalid auth type');
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
            throw new Error('Storage with target already exists for this profile');
        }
        return this.save();
    }

    static async getExisting({ profile, authType, username, url, oneAuthId }:
        {
            profile: Profile,
            authType: StorageAuthType,
            username: string | null,
            url: string | null,
            oneAuthId: string | null,
        }) {
        const where: any = { ProfileId: profile.id };
        if (authType === StorageAuthType.OneAuth) {
            if (!oneAuthId) throw new Error('oneAuthId is required');
            where.oneAuthId = oneAuthId;
            return await this.findOne({ where });
        } else {
            if (!url) throw new Error('url is required');
            where.url = url;
            where.username = username;
            return await this.findOne({ where });
        }
    }

    static async createStorage(profile: Profile, data: CreateStorageType) {
        if (!profile) throw new Error('Profile is required to create storage');
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
                throw new Error('Storage with target already exists for this profile');
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
}

export class PendingAuth extends DbModel {
    declare id: number;
    declare referenceId: string;
    declare partialCode1: string;
    declare storageType: StorageType;
    declare expiresOn: Date;
    declare setProfile: (profile: Profile) => Promise<void>;
    declare getProfile: () => Promise<Profile>;

    static _columns = {
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
            }
        },
        partialCode1: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            }
        },
        storageType: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            }
        },
        expiresOn: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    }

    getDetails() {
        return {
            id: this.id,
            referenceId: this.referenceId,
            storageType: this.storageType,
            expiresOn: this.expiresOn,
        }
    }

    makeSecret(partialCode2: string) {
        return createHash(this.partialCode1 + partialCode2);
    }

    async createStorage({ oneAuthId, partialCode2 }: {
        oneAuthId: string,
        partialCode2: string,
    }) {
        const profile = await this.getProfile();
        if (!profile) throw new Error('Profile not found');
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

    static async createPendingAuth({ profile, storageType, referenceId, partialCode1 }:
        { profile: Profile, storageType: StorageType, referenceId: string, partialCode1: string }) {
        const expiresOn = new Date(Date.now() + 60 * 60 * 1000);
        const pendingAuth = await PendingAuth.create({ storageType, referenceId, expiresOn, partialCode1 });
        await pendingAuth.setProfile(profile);
        return pendingAuth;
    }

    static async getByReferenceId(referenceId: string) {
        return PendingAuth.findOne({ where: { referenceId } });
    }

    static async clearExpired() {
        return PendingAuth.destroy({ where: { expiresOn: { [Op.lt]: new Date() } } });
    }
}

export class StorageMeta extends DbModel {
    declare id: number;
    declare hcRoot: string;
    declare thumbsDir: string;
    declare photosDir: string;
    declare photosAssetsDir: string;
    declare lastScanOn: Date;
    declare photosLastSyncOn: Date;
    declare setStorage: (storage: Storage) => Promise<void>;
    declare getStorage: () => Promise<Storage>;

    static _columns = {
        hcRoot: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            }
        },

        thumbsDir: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            }
        },

        photosDir: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            }
        },
        photosAssetsDir: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            }
        },

        lastScanOn: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        photosLastSyncOn: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: new Date(0),
        },
    }

    async getDetails() {
        return this.toJSON();
    }

    async del() {
        return this.destroy();
    }

    async updateLastScan() {
        this.update({ lastScanOn: new Date() });
    }

    scanRequired() {
        const now = new Date();
        const expired = new Date(now.getTime() - DAYS_5);
        return this.lastScanOn < expired;
    }

    static async getByStorage(storage: Storage) {
        const storageMeta = await StorageMeta.findOne({ where: { StorageId: storage.id } });
        return storageMeta;
    }

    static async createOrUpdate(storage: Storage, data: {
        hcRoot: string,
        thumbsDir: string,
        photosDir: string,
        photosAssetsDir: string,
    }) {
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

    static _columns = {
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
            }
        },
        mimeType: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            }
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
        }
    }

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
        }
    }

    static async getPhoto(itemId: number, storage: Storage) {
        return Photo.findOne({ where: { itemId, StorageId: storage.id } });
    }

    static async getPhotosByIds(itemIds: number[], storage: Storage) {
        return Photo.findAll({ where: { itemId: itemIds, StorageId: storage.id } });
    }

    static async updateBulk(updates: { [itemId: number]: any; }, storage: Storage) {
        const promises = [];
        for (const itemId of Object.keys(updates).map(id => parseInt(id))) {
            const update = updates[itemId];
            if (update.StorageId) delete update.StorageId;
            if (update.itemId) delete update.itemId;
            if (update.folderNo) delete update.folderNo;
            if (update.addedOn) delete update.addedOn;
            promises.push(
                Photo.update(update, { where: { itemId, StorageId: storage.id } }));
        }
        return Promise.all(promises);
    }

    static async deletePhotos(itemIds: number[], storage: Storage) {
        return Photo.destroy({ where: { itemId: itemIds, StorageId: storage.id } });
    }

    static async deleteAllPhotos(storage: Storage) {
        return Photo.destroy({ where: { StorageId: storage.id } });
    }

    static async getPhotos(offset: number, limit: number, storage: Storage, orderBy: string, ascending = true) {
        return Photo.findAll({ where: { StorageId: storage.id }, offset, limit, order: [[orderBy, ascending ? 'ASC' : 'DESC']] });
    }

    static async createPhotosBulk(items: createPhotoType[], storage: Storage) {
        items = items.map(item => {
            return { ...item, StorageId: storage.id };
        });
        return Photo.bulkCreate(items);
    }
}

export type createPhotoType = {
    itemId: number,
    folderNo: number,
    fileId: string,
    mimeType: string,
    capturedOn: Date,
    lastEditedOn: Date,
    addedOn: Date,
    size: number,
    duration: number | null,
    height: number | null,
    width: number | null,
    originDevice: string | null,
    metadata: string | null,
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

    static _columns = {
        fileId: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            }
        },
        mimeType: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            }
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
    }

    getDetails() {
        return {
            fileId: this.fileId,
            mimeType: this.mimeType,
            updatedAt: this.updatedAt,
            image: this.image,
            height: this.height,
            width: this.width,
        }
    }

    isUpToDate(fileLastModified: Date) {
        return this.updatedAt >= fileLastModified;
    }

    async updateThumb({ mimeType, height, width, image }: {
        mimeType?: string,
        height?: number | null,
        width?: number | null,
        image: string,
    }) {
        this.mimeType = mimeType || this.mimeType;
        this.height = height || this.height;
        this.width = width || this.width;
        this.image = image;
        this.lastReadOn = new Date();
        return this.save();
    }

    static async getThumb(fileId: string, storage: Storage) {
        const thumb = await Thumb.findOne({ where: { fileId, StorageId: storage.id } });
        if (!thumb) return null;
        thumb.lastReadOn = new Date();
        thumb.save(); // not waiting for save to complete
        return thumb;
    }

    static async createThumb({
        fileId,
        mimeType,
        height,
        width,
        image,
    }: {
        fileId: string,
        mimeType: string,
        height: number | null,
        width: number | null,
        image: string,
    }, storage: Storage) {
        return Thumb.create({ fileId, mimeType, height, width, image, StorageId: storage.id });
    }

    static async deleteThumbs(fileIds: string[], storage: Storage) {
        return Thumb.destroy({ where: { fileId: fileIds, StorageId: storage.id } });
    }

    static async removeOldThumbs() {
        const now = new Date();
        const expired = new Date(now.getTime() - (DAYS_5 * 4)); // 20 days
        return Thumb.destroy({ where: { lastReadOn: { [Op.lt]: expired } } });
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
    ];
    for (const cls of classes) {
        cls.register(db);
    }
    Profile.hasMany(Storage, { onDelete: 'CASCADE' });
    Storage.belongsTo(Profile);
    Storage.hasOne(StorageMeta, { onDelete: 'CASCADE' });
    StorageMeta.belongsTo(Storage);
    PendingAuth.belongsTo(Profile);
    Photo.belongsTo(Storage);
    Storage.hasMany(Photo, { onDelete: 'CASCADE' });
    Thumb.belongsTo(Storage);
    Storage.hasMany(Thumb, { onDelete: 'CASCADE' });
}
