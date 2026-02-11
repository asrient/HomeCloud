import path from 'node:path';
import { DataTypes, Model, ModelStatic, Op, Sequelize, ModelAttributes } from 'sequelize';
import { createPhotoType } from './types';
import { GetPhotosParams, Photo } from 'shared/types';

const COLUMNS: ModelAttributes = {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    directoryName: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true,
        },
    },
    parentDirectory: {
        type: DataTypes.STRING,
        allowNull: true,
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
    directoryName: string;
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
    parentDirectory: string | null;
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
                { unique: true, fields: ['parentDirectory', 'directoryName', 'filename'] },
            ]
        });
    }

    getMinDetails(photo: PhotoModel): Photo {
        return {
            id: photo.id.toString(),
            fileId: path.join(this.location, photo.parentDirectory || '', photo.directoryName, photo.filename),
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
        if (directory.endsWith('/')) directory = directory.slice(0, -1);
        return directory;
    }

    getDirectoryParts(dir: string): { parent: string; name: string } {
        dir = this.normalizeDirectory(dir);
        if (dir === '.') return { parent: null, name: '.' };
        const parts = dir.split('/');
        const name = parts.pop();
        let parent = parts.join('/');
        if (parent === '') parent = '.';
        return { parent, name };
    }

    async updateBulk(
        updates: { [id: number]: any },
    ): Promise<PhotoModel[]> {
        const promises: Promise<[affectedCount: number, affectedRows: PhotoModel[]]>[] = [];
        for (const id of Object.keys(updates).map((id) => parseInt(id))) {
            const update = updates[id];
            if (update.directory) {
                const { parent, name } = this.getDirectoryParts(update.directory);
                update.directoryName = name;
                update.parentDirectory = parent;
                delete update.directory;
            }
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

    async deletePhotosByPath(paths: { directory: string; filename: string }[]) {
        const promises = paths.map(({ directory, filename }) => {
            const { name, parent } = this.getDirectoryParts(directory);
            return this.Photo.destroy({ where: { directoryName: name, filename, parentDirectory: parent } });
        });
        return Promise.all(promises);
    }

    async deletePhotosByDirectories(directories: string[]) {
        // delete photos where the directory as its parent
        // this will not work if directory is root
        const promises: Promise<number>[] = [];
        directories.forEach((directory) => {
            directory = this.normalizeDirectory(directory);
            if (directory === '.') {
                throw new Error('Cannot delete root directory from library');
            }
            const { name, parent } = this.getDirectoryParts(directory);
            promises.push(this.Photo.destroy({
                where: {
                    [Op.or]: [
                        { parentDirectory: { [Op.startsWith]: `${directory}/` } },
                        { parentDirectory: directory },
                        { directoryName: name, parentDirectory: parent },
                    ],

                },
            }));
        });
        const result = await Promise.all(promises);
        let sum = 0;
        result.forEach((count) => {
            sum += count;
        });
        return sum;
    }

    async getImmediateChildDirectories(directory: string) {
        directory = this.normalizeDirectory(directory);
        const resp = await this.Photo.findAll({
            where: {
                parentDirectory: directory,
            },
            attributes: ['directoryName'],
            group: ['directoryName'],
        });
        return resp.map((photo) => path.join(directory, photo.directoryName));
    }

    async deleteAllPhotos() {
        return this.Photo.destroy();
    }

    async getPhotos({ cursor, limit, sortBy, ascending = true }: GetPhotosParams): Promise<PhotoModel[]> {
        return this.Photo.findAll({
            offset: cursor ? parseInt(cursor) : 0,
            limit,
            order: [[sortBy, ascending ? "ASC" : "DESC"]],
        });
    }

    async createPhotosBulk(items: createPhotoType[]): Promise<PhotoModel[]> {
        // normalize directory field
        const photoParams: createPhotoExtendedType[] = items.map((item) => {
            const { parent, name } = this.getDirectoryParts(item.directory);
            return {
                ...item,
                parentDirectory: parent,
                directoryName: name,
                lastEditedOn: new Date(),
                addedOn: new Date(),
            };
        });
        return this.Photo.bulkCreate(photoParams);
    }

    async getFilenamesForDirectory(directory: string) {
        const { name, parent } = this.getDirectoryParts(directory);
        const resp = await this.Photo.findAll({
            where: {
                directoryName: name,
                parentDirectory: parent,
            },
            attributes: ['filename'],
        });
        return resp.map((photo) => photo.filename);
    }
}

type createPhotoExtendedType = Omit<createPhotoType, 'directory'> & {
    parentDirectory: string | null;
    directoryName: string;
    lastEditedOn: Date;
    addedOn: Date;
};
