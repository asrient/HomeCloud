import { StorageAuthType } from "../envConfig";
import { Storage } from "../models";
import { FsDriver, RemoteItem } from "./interface";
import { createClient, FileStat, AuthType as WebdavAuthType, WebDAVClient, WebDAVClientOptions } from "webdav";


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
            if(!!storage.username) {
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
            absolutePath: item.filename,
            parentIds: null,
            size: item.size,
            lastModified: new Date(item.lastmod),
            createdAt: new Date(item.created),
            mimeType: item.mime,
            etag: item.etag,
            thubmnail: null,
        }
    }

    public override async readDir(path: string) {
        const contents = await this.client.getDirectoryContents(path) as FileStat[];
        return contents.map((item: FileStat) => this.toRemoteItem(item));
    }
}
