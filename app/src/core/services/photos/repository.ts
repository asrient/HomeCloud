import path from 'node:path';
import { DataTypes, Model, ModelStatic, Sequelize } from 'sequelize';
import { ModelAttributes } from 'sequelize/types';
import { createPhotoType, getPhotosParams } from './types';

const COLUMNS: ModelAttributes = {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    directory: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true,
        },
    },
    filename: {
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
        defaultValue: new Date(),
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

export interface PhotoModel extends Model {
    id: number;
    directory: string;
    filename: string;
    mimeType: string;
    capturedOn: Date;
    lastEditedOn: Date;
    addedOn: Date;
    size: number;
    duration: number | null;
    height: number;
    width: number;
    originDevice: string | null;
    metadata: string | null;
}

export interface InfoModel extends Model {
    key: string;
    value: string;
}

export class InfoRepository {
    private Info: ModelStatic<InfoModel>;

    constructor(db: Sequelize) {
        this.Info = db.define<InfoModel>('Info', {
            key: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            value: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
        });
    }

    async get(key: string) {
        return this.Info.findOne({ where: { key } });
    }

    async set(key: string, value: string) {
        return this.Info.upsert({ key, value });
    }

    async delete(key: string) {
        return this.Info.destroy({ where: { key } });
    }

    async setLastUpdate(date: Date) {
        return this.set('lastUpdate', date.toISOString());
    }

    async getLastUpdate() {
        const resp = await this.get('lastUpdate');
        return resp ? new Date(resp.value) : null;
    }

    async setVersion(version: string) {
        return this.set('version', version);
    }

    async getVersion() {
        const resp = await this.get('version');
        return resp ? resp.value : null;
    }
}

export class PhotoRepository {
    private Photo: ModelStatic<PhotoModel>;
    private location: string;

    constructor(db: Sequelize, location: string) {
        this.location = location;
        this.Photo = db.define<PhotoModel>('Photo', COLUMNS, {
            indexes: [
                { unique: true, fields: ['directory', 'filename'] },
            ]
        });
    }

    getMinDetails(photo: PhotoModel) {
        return {
            id: photo.id,
            fileId: path.join(this.location, photo.directory, photo.filename),
            mimeType: photo.mimeType,
            capturedOn: photo.capturedOn,
            addedOn: photo.addedOn,
            duration: photo.duration,
            height: photo.height,
            width: photo.width,
        };
    }

    async getPhoto(id: number) {
        return this.Photo.findOne({ where: { id } });
    }

    async getPhotosByIds(ids: number[]) {
        return this.Photo.findAll({ where: { id: ids } });
    }

    normalizeDirectory(directory: string) {
        directory = directory.replace(/\\/g, '/');
        if (directory.startsWith('/')) directory = directory.slice(1);
        if (directory === '') directory = '.';
        return directory;
    }

    async updateBulk(
        updates: { [id: number]: any },
    ): Promise<PhotoModel[]> {
        const promises: Promise<[affectedCount: number, affectedRows: PhotoModel[]]>[] = [];
        for (const id of Object.keys(updates).map((id) => parseInt(id))) {
            const update = updates[id];
            if (update.directory) update.directory = this.normalizeDirectory(update.directory);
            if (update.id) delete update.id;
            if (update.addedOn) delete update.addedOn;
            update.lastEditedOn = new Date();
            promises.push(
                this.Photo.update(update, { where: { id }, returning: true }),
            );
        }
        const resp = await Promise.all(promises);
        return resp.map(([, photos]) => photos[0]);
    }

    async deletePhotos(ids: number[]) {
        return this.Photo.destroy({ where: { id: ids } });
    }

    async deletePhotosByPath(paths: {directory: string; filename: string}[]) {
        const promises = paths.map(({ directory, filename }) => {
            directory = this.normalizeDirectory(directory);
            return this.Photo.destroy({ where: { directory, filename } });
        });
        return Promise.all(promises);
    }

    async deleteAllPhotos() {
        return this.Photo.destroy();
    }

    async getPhotos({ offset, limit, sortBy, ascending = true }: getPhotosParams): Promise<PhotoModel[]> {
        return this.Photo.findAll({
            offset,
            limit,
            order: [[sortBy, ascending ? "ASC" : "DESC"]],
        });
    }

    async createPhotosBulk(items: createPhotoType[]): Promise<PhotoModel[]> {
        // normalize directory field
        items.forEach((item) => {
            item.directory = this.normalizeDirectory(item.directory);
        });
        return this.Photo.bulkCreate(items);
    }

    async getFilenamesForDirectory(directory: string) {
        directory = this.normalizeDirectory(directory);
        const resp = await this.Photo.findAll({
            where: {
                directory,
            },
            attributes: ['filename'],
        });
        return resp.map((photo) => photo.filename);
    }
}
