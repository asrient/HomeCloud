import { StorageType } from "../envConfig";
import { Storage } from "../models";
import { ApiRequestFile } from "../interface";
import { ReadStream } from "original-fs";

export interface RemoteItem {
    name: string;
    id: string;
    parentIds: string[] | null;
    type: 'file' | 'directory';
    size: number | null;
    lastModified: Date | null;
    createdAt: Date | null;
    mimeType: string | null;
    etag: string | null;
    thubmnail: string | null;
}

export class FsDriver {
    storage: Storage;
    storageType: StorageType = StorageType.WebDav;
    constructor(storage: Storage) {
        this.storage = storage;
    }

    public async init() {
    }

    public async readDir(id: string): Promise<RemoteItem[]> {
        throw new Error('Not implemented');
    }

    public async readRootDir(): Promise<RemoteItem[]> {
        return this.readDir('/');
    }

    public async mkDir(name: string, baseId: string): Promise<RemoteItem> {
        throw new Error('Not implemented');
    }

    public async unlink(id: string): Promise<void> {
        throw new Error('Not implemented');
    }

    public async unlinkMultiple(ids: string[]): Promise<string[]> {
        const deleted: string[] = [];
        const promises = [];
        for (const id of ids) {
            promises.push(this.unlink(id).then(() => deleted.push(id)));
        }
        await Promise.all(promises);
        return deleted;
    }

    public async rename(id: string, newName: string): Promise<RemoteItem> {
        throw new Error('Not implemented');
    }

    public async writeFile(folderId: string, file: ApiRequestFile): Promise<RemoteItem> {
        throw new Error('Not implemented');
    }

    public async writeFiles(folderId: string, files: ApiRequestFile[]): Promise<RemoteItem[]> {
        const result: RemoteItem[] = [];
        const promises = [];
        for (const file of files) {
            promises.push(this.writeFile(folderId, file).then((item) => result.push(item)));
        }
        await Promise.all(promises);
        return result;
    }

    public async updateFile(id: string, file: ApiRequestFile): Promise<RemoteItem> {
        throw new Error('Not implemented');
    }

    public async readFile(id: string): Promise<[ReadStream, string]> {
        throw new Error('Not implemented');
    }

    public async moveFile(id: string, destParentId: string, newFileName: string, deleteSource: boolean): Promise<RemoteItem> {
        throw new Error('Not implemented');
    }

    public async moveDir(id: string, destParentId: string, newDirName: string, deleteSource: boolean): Promise<RemoteItem> {
        throw new Error('Not implemented');
    }

    public async getStat(id: string): Promise<RemoteItem> {
        throw new Error('Not implemented');
    }

    public async getStats(ids: string[]): Promise<{ [id: string]: RemoteItem }> {
        const result: { [id: string]: RemoteItem } = {};
        const promises = [];
        for (const id of ids) {
            promises.push(this.getStat(id).then((item) => result[id] = item));
        }
        await Promise.all(promises);
        return result;
    }

    public async filenameToId(filename: string, baseId: string): Promise<string> {
        return `${baseId}/${filename}`;
    }
}