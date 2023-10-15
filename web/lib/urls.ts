import { NextUrl } from './types';

export function buildNextUrl(path: string, params?: { [key: string]: any }): NextUrl {
    return {
        pathname: path,
        query: params,
    }
}

export function folderViewUrl(storageId: number, folderId: string = '/') {
    return buildNextUrl('/files/folder', { s: storageId, id: folderId });
}

export function photosByStorageUrl(storageId: number) {
    return buildNextUrl('/photos/storage', { id: storageId });
}
