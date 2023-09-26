import { google, drive_v3 } from 'googleapis';

import { StorageType, StorageAuthType } from "../envConfig";
import { Profile, Storage } from "../models";
import { FsDriver, RemoteItem } from "./interface";
import { getAccessToken } from './oneAuth';
import { ApiRequestFile } from '../interface';
import { ReadStream } from 'fs';

const OAuth2 = google.auth.OAuth2;

export class GoogleFsDriver extends FsDriver {
    override storageType = StorageType.Google;
    override providesThumbnail = true;
    driver?: drive_v3.Drive;

    override async init() {
        const client = new OAuth2();
        const accessToken = await getAccessToken(this.storage);
        if (!accessToken) {
            throw new Error('Could not get access token');
        }
        client.setCredentials({ access_token: accessToken });
        this.driver = google.drive({ version: 'v3', auth: client });
    }

    // reference: https://developers.google.com/drive/api/reference/rest/v3/files
    toRemoteItem(item: drive_v3.Schema$File): RemoteItem {
        return {
            type: this.mimeToItemType(item.mimeType!),
            name: item.name!,
            id: item.id!,
            parentIds: item.parents!,
            size: Number(item.size!),
            lastModified: new Date(item.modifiedTime!),
            createdAt: new Date(item.createdTime!),
            mimeType: item.mimeType!,
            etag: '',
            thumbnail: item.thumbnailLink!,
        }
    }

    normalizeRootId(id: string): string {
        if (id === '/') {
            return 'root';
        }
        return id;
    }

    mimeToItemType(mimeType: string): 'file' | 'directory' {
        if (mimeType === this.folderMineType) {
            return 'directory';
        }
        return 'file';
    }

    fileAttrs = 'id, name, mimeType, size, modifiedTime, createdTime, parents, thumbnailLink'
    folderMineType = 'application/vnd.google-apps.folder';

    public override async readDir(id: string) {
        id = this.normalizeRootId(id);
        try {
            const res = await this.driver!.files.list({
                q: `'${id}' in parents`,
                fields: `nextPageToken, files(${this.fileAttrs})`,
                spaces: 'drive',
                pageSize: 1000,
            });
            if (!res.data.files) {
                console.error('Error getting files', res);
                throw new Error('Could not get files');
            }

            const files = res.data.files;
            return files.map((item) => this.toRemoteItem(item));
        } catch (err) {
            // TODO(developer) - Handle error
            console.error(err);
            throw err;
        }
    }

    public override async mkDir(name: string, parentId: string): Promise<RemoteItem> {
        parentId = this.normalizeRootId(parentId);
        let exists = false;
        try {
            exists = !!await this.getStatByFilename(name, parentId);
        } catch (err) {
            exists = false;
        }
        if (exists) {
            throw new Error('Folder already exists');
        }
        try {
            const res = await this.driver!.files.create({
                requestBody: {
                    name,
                    mimeType: this.folderMineType,
                    parents: [parentId],
                },
                fields: this.fileAttrs,
            });
            if (!res.data) {
                console.error('Error creating folder', res);
                throw new Error('Could not create folder');
            }
            return this.toRemoteItem(res.data);
        } catch (err) {
            // TODO(developer) - Handle error
            console.error(err);
            throw err;
        }
    }

    public override async unlink(id: string): Promise<void> {
        try {
            await this.driver!.files.delete({
                fileId: id,
            });
        } catch (err) {
            // TODO(developer) - Handle error
            console.error(err);
            throw err;
        }
    }

    public override async rename(id: string, newName: string): Promise<RemoteItem> {
        try {
            const res = await this.driver!.files.update({
                fileId: id,
                requestBody: {
                    name: newName,
                },
                fields: this.fileAttrs,
            });
            if (!res.data) {
                console.error('Error renaming file', res);
                throw new Error('Could not rename file');
            }
            return this.toRemoteItem(res.data);
        } catch (err) {
            // Handle error
            console.error(err);
            throw err;
        }
    }

    public override async writeFile(folderId: string, file: ApiRequestFile): Promise<RemoteItem> {
        folderId = this.normalizeRootId(folderId);
        try {
            const res = await this.driver!.files.create({
                requestBody: {
                    name: file.name,
                    mimeType: file.mime,
                    parents: [folderId],
                },
                media: {
                    mimeType: file.mime,
                    body: file.stream,
                },
                fields: this.fileAttrs,
            });
            if (!res.data) {
                console.error('Error uploading file', res);
                throw new Error('Could not upload file');
            }
            return this.toRemoteItem(res.data);
        } catch (err) {
            // Handle error
            console.error(err);
            throw err;
        }
    }

    public override async updateFile(id: string, file: ApiRequestFile): Promise<RemoteItem> {
        try {
            const res = await this.driver!.files.update({
                fileId: id,
                media: {
                    mimeType: file.mime,
                    body: file.stream,
                },
                fields: this.fileAttrs,
            });
            if (!res.data) {
                console.error('Error updating file', res);
                throw new Error('Could not update file');
            }
            return this.toRemoteItem(res.data);
        } catch (err) {
            // Handle error
            console.error(err);
            throw err;
        }
    }

    public override async readFile(id: string): Promise<[ReadStream, string]> {
        try {
            const res = await this.driver!.files.get({
                fileId: id,
                alt: 'media',
            }, {
                responseType: 'stream',
            });
            if (!res.data) {
                console.error('Error reading file', res);
                throw new Error('Could not read file');
            }
            const mime = res.headers['content-type'];
            return [res.data as ReadStream, mime];
        } catch (err) {
            // Handle error
            console.error(err);
            throw err;
        }
    }

    public override async moveFile(id: string, destParentId: string, newFileName: string, deleteSource: boolean): Promise<RemoteItem> {
        destParentId = this.normalizeRootId(destParentId);
        try {
            const res = await this.driver!.files.copy({
                fileId: id,
                requestBody: {
                    name: newFileName,
                    parents: [destParentId],
                },
                fields: this.fileAttrs,
            });
            if (!res.data) {
                console.error('Error moving file', res);
                throw new Error('Could not move file');
            }
            if (deleteSource) {
                await this.unlink(id);
            }
            return this.toRemoteItem(res.data);
        } catch (err) {
            // Handle error
            console.error(err);
            throw err;
        }
    }

    public override async moveDir(id: string, destParentId: string, newDirName: string, deleteSource: boolean): Promise<RemoteItem> {
        destParentId = this.normalizeRootId(destParentId);
        const newDir = await this.mkDir(newDirName, destParentId);
        const files = await this.readDir(id);
        const promises = [];
        for (const file of files) {
            if(file.type === 'directory') {
                promises.push(this.moveDir(file.id, newDir.id, file.name, deleteSource));
            }
            else {
            promises.push(this.moveFile(file.id, newDir.id, file.name, deleteSource));
            }
        }
        await Promise.all(promises);
        if (deleteSource) {
            await this.unlink(id);
        }
        return newDir;
    }

    public override async getStat(id: string): Promise<RemoteItem> {
        id = this.normalizeRootId(id);
        try {
            const res = await this.driver!.files.get({
                fileId: id,
                fields: this.fileAttrs,
            });
            if (!res.data) {
                console.error('Error getting file stat', res);
                throw new Error('Could not get file stat');
            }
            return this.toRemoteItem(res.data);
        } catch (err) {
            // Handle error
            console.error(err);
            throw err;
        }
    }

    public override async readRootDir() {
        return this.readDir('root');
    }

    public override async getStatByFilename(filename: string, parentId: string): Promise<RemoteItem> {
        parentId = this.normalizeRootId(parentId);
        const res = await this.driver!.files.list({
            q: `name='${filename}' and '${parentId}' in parents`,
            fields: `nextPageToken, files(${this.fileAttrs})`,
            spaces: 'drive',
        });
        if (!res.data.files) {
            console.error('Error getting files', res);
            throw new Error('Could not get files');
        }
        const files = res.data.files;
        if (files.length === 0) {
            throw new Error('File not found');
        }
        return this.toRemoteItem(files[0]);
    }

    public override async getIdByFilename(filename: string, baseId: string): Promise<string> {
        return (await this.getStatByFilename(filename, baseId)).id;
    }
}
