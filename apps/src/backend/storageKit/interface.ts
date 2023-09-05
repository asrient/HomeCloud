import { StorageType } from "../envConfig";
import { Profile, Storage, CreateStorageType, EditStorageType } from "../models";

export interface RemoteItem {
    filename: string;
    absolutePath: string | null;
    type: 'file' | 'directory';
    size?: number;
    lastModified?: Date;
    createdAt?: Date;
    mimeType?: string;
    etag?: string;
}

export class FsDriver {
    storage: Storage;
    storageType: StorageType = StorageType.WebDav;
    constructor(storage: Storage) {
        this.storage = storage;
    }
    public async readDir(path: string): Promise<RemoteItem[]> {
        throw new Error('Not implemented');
    }

    public async mkDir(path: string): Promise<RemoteItem> {
        throw new Error('Not implemented');
    }

    public async rm(paths: string[]): Promise<boolean> {
        throw new Error('Not implemented');
    }

    public async rename(path: string, newName: string): Promise<RemoteItem> {
        throw new Error('Not implemented');
    }

    public async writeFiles(basePath: string, files: { [key: string]: string }): Promise<RemoteItem[]> {
        throw new Error('Not implemented');
    }

    public async readFile(path: string): Promise<Buffer> {
        throw new Error('Not implemented');
    }

    public async move(paths: string[], dest: string, deleteSource: boolean): Promise<RemoteItem[]> {
        throw new Error('Not implemented');
    }
}
