import { google, drive_v3 } from 'googleapis';

import { StorageType, StorageAuthType } from "../envConfig";
import { Profile, Storage } from "../models";
import { FsDriver, RemoteItem } from "./interface";
import { getAccessToken } from './oneAuth';

const OAuth2 = google.auth.OAuth2;

export class GoogleFsDriver extends FsDriver {
    driver?: drive_v3.Drive;

    async init() {
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
            absolutePath: null,
            parentIds: item.parents!,
            size: Number(item.size!),
            lastModified: new Date(item.modifiedTime!),
            createdAt: new Date(item.createdTime!),
            mimeType: item.mimeType!,
            etag: '',
            thubmnail: item.thumbnailLink!,
        }
    }

    mimeToItemType(mimeType: string): 'file' | 'directory' {
        if (mimeType === 'application/vnd.google-apps.folder') {
            return 'directory';
        }
        return 'file';
    }

    public override async readDir(id: string) {
        try {
            const res = await this.driver!.files.list({
                q: `'${id}' in parents`,
                fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, createdTime, parents, thumbnailLink)',
                spaces: 'drive',
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

    public async readRootDir() {
        return this.readDir('root');
    }
}
