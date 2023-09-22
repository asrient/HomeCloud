import { StorageAuthType } from "../envConfig";
import { Storage } from "../models";
import { FsDriver, RemoteItem } from "./interface";
import { createClient, FileStat, AuthType as WebdavAuthType, WebDAVClient, WebDAVClientOptions } from "webdav";
import { ApiRequestFile } from "../interface";
import { ReadStream } from "original-fs";
import { streamToBuffer } from "../utils";

function mapAuthType(authType: StorageAuthType) {
    switch (authType) {
        case StorageAuthType.Basic:
            return WebdavAuthType.Password;
        case StorageAuthType.Digest:
            return WebdavAuthType.Digest;
        case StorageAuthType.None:
            return WebdavAuthType.None;
        default:
            throw new Error('Invalid auth type');
    }
}

export class WebdavFsDriver extends FsDriver {
    client: WebDAVClient;
    constructor(storage: Storage) {
        super(storage);
        const options: WebDAVClientOptions = {
            authType: mapAuthType(storage.authType),
        }
        if (storage.secret && storage.authType !== StorageAuthType.None) {
            if (!!storage.username) {
                options.username = storage.username;
            }
            options.password = storage.secret;
        }
        this.client = createClient(storage.url!, options);
    }

    toRemoteItem(item: any): RemoteItem {
        return {
            type: item.type,
            name: item.basename,
            id: item.filename,
            parentIds: [item.filename.split('/').slice(0, -1).join('/')],
            size: item.size,
            lastModified: new Date(item.lastmod),
            createdAt: new Date(item.created),
            mimeType: item.mime,
            etag: item.etag,
            thubmnail: null,
        }
    }

    normalizeRootId(id: string): string {
        if (id === '/') {
            return '';
        }
        return id;
    }

    public override async readDir(path: string) {
        const contents = await this.client.getDirectoryContents(path) as FileStat[];
        return contents.map((item: FileStat) => this.toRemoteItem(item));
    }

    public override async readRootDir() {
        return this.readDir('/');
    }

    public override async mkDir(name: string, baseId: string) {
        baseId = this.normalizeRootId(baseId);
        const path = `${baseId}/${name}`;
        await this.client.createDirectory(path);
        return this.toRemoteItem(await this.client.stat(path));
    }

    public override async unlink(id: string) {
        await this.client.deleteFile(id);
    }

    public override async rename(id: string, newName: string) {
        const newPath = `${this.pathToParentFolder(id)}/${newName}`;
        await this.client.moveFile(id, newPath);
        return this.getStat(newPath);
    }

    public override async writeFile(folderId: string, file: ApiRequestFile, overwrite = false) {
        folderId = this.normalizeRootId(folderId);
        const path = `${folderId}/${file.name}`;
        const stream = file.stream as ReadStream;
        const buffer = await streamToBuffer(stream);
        const r = await this.client.putFileContents(path, buffer, { overwrite });
        if (!r) {
            throw new Error('Could not write file');
        }
        return this.getStat(path);
    }

    public override async readFile(id: string): Promise<[ReadStream, string]> {
        const stat = await this.client.stat(id) as FileStat;
        const stream = this.client.createReadStream(id);
        return [stream as ReadStream, stat.mime as string];
    }

    pathToFilename(path: string) {
        return path.split('/').pop()!;
    }

    pathToParentFolder(path: string) {
        const parts = path.split('/');
        parts.pop();
        return parts.join('/');
    }

    public override async updateFile(id: string, file: ApiRequestFile): Promise<RemoteItem> {
        file.name = this.pathToFilename(id);
        return this.writeFile(this.pathToParentFolder(id), file, true);
    }

    public override async moveFile(id: string, destParentId: string, newFileName: string, deleteSource: boolean): Promise<RemoteItem> {
        destParentId = this.normalizeRootId(destParentId);
        const destPath = `${destParentId}/${newFileName}`;
        if (deleteSource) {
            await this.client.moveFile(id, destPath);
        } else {
            await this.client.copyFile(id, destPath);
        }
        return this.getStat(destPath);
    }

    public override async moveDir(id: string, destParentId: string, newDirName: string, deleteSource: boolean): Promise<RemoteItem> {
        destParentId = this.normalizeRootId(destParentId);
        return this.moveFile(id, destParentId, newDirName, deleteSource);
    }

    public override async getStat(id: string): Promise<RemoteItem> {
        id = this.normalizeRootId(id);
        const item = await this.client.stat(id);
        return this.toRemoteItem(item);
    }
}
