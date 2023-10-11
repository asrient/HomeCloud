import { NextUrl } from './types';

export function buildNextUrl(path: string, params?: any): NextUrl {
    return {
        pathname: path,
        query: params,
    }
}

export function folderViewUrl(storageId: number, folderId: string = '/') {
    return buildNextUrl('/files/folder', { s: storageId, id: folderId });
}
