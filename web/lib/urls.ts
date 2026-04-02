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
    return buildNextUrl('/settings');
}

export function agentsUrl() {
    return buildNextUrl('/agents');
}

export function deviceSettingsUrl(fingerprint: string) {
    return buildNextUrl('/settings/device', { id: fingerprint });
}
