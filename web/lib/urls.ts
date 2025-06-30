import { NextUrl } from './types';
import { isMobile } from './utils';

export function buildNextUrl(path: string, params?: { [key: string]: any }): NextUrl {
    return {
        pathname: path,
        query: params,
    }
}

export function folderViewUrl(fingerprint: string | null, path: string = '') {
    return buildNextUrl('/files/folder', { path, fingerprint });
}

export function photosLibraryUrl(storageId: number, libraryId: number) {
    return buildNextUrl('/photos/library', { s: storageId, lib: libraryId });
}

export function settingsUrl() {
    if (isMobile()) {
        return buildNextUrl('/settings');
    }
    return buildNextUrl('/settings/general');
}

export function deviceSettingsUrl(fingerprint: string) {
    return buildNextUrl('/settings/device', { id: fingerprint });
}
