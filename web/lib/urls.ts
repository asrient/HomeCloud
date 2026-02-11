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

export function photosLibraryUrl(fingerprint: string | null, libraryId: string) {
    return buildNextUrl('/photos/library', { fingerprint: fingerprint, lib: libraryId });
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
