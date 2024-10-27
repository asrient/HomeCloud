import { NextUrl } from './types';
import { isMobile } from './utils';

export function buildNextUrl(path: string, params?: { [key: string]: any }): NextUrl {
    return {
        pathname: path,
        query: params,
    }
}

export function folderViewUrl(storageId: number, folderId: string = '') {
    return buildNextUrl('/files/folder', { s: storageId, id: folderId });
}

export function photosByStorageUrl(storageId: number) {
    return buildNextUrl('/photos/storage', { id: storageId });
}

export function settingsUrl() {
    if (isMobile()) {
        return buildNextUrl('/settings');
    }
    return buildNextUrl('/settings/profile');
}

export function notesUrl() {
    return buildNextUrl('/notes');
}

export function noteUrl(storageId: number, noteId: string) {
    return buildNextUrl('/notes/view', { s: storageId, id: noteId });
}
