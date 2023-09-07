import { StorageType } from "../envConfig";
import { Profile, Storage, CreateStorageType, EditStorageType } from "../models";
import { ApiRequestFile } from "../interface";

export interface RemoteItem {
    name: string;
    id: string;
    absolutePath: string | null;
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

    public async mkDir(id: string): Promise<RemoteItem> {
        throw new Error('Not implemented');
    }

    public async unlink(ids: string[]): Promise<boolean> {
        throw new Error('Not implemented');
    }

    public async rename(id: string, newName: string): Promise<RemoteItem> {
        throw new Error('Not implemented');
    }

    public async writeFiles(folderId: string, files: ApiRequestFile[]): Promise<RemoteItem[]> {
        throw new Error('Not implemented');
    }

    public async readFile(id: string): Promise<ReadableStream> {
        throw new Error('Not implemented');
    }

    public async move(ids: string[], dest: string, deleteSource: boolean): Promise<RemoteItem[]> {
        throw new Error('Not implemented');
    }

    public async getStat(id: string): Promise<RemoteItem> {
        const stats = await this.getStats([id]);
        return stats[id];
    }

    public async getStats(ids: string[]): Promise<{ [id: string]: RemoteItem }> {
        throw new Error('Not implemented');
    }
}
