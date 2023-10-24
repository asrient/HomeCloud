import { ApiClient } from './apiClient';
import { Photo } from '../types';

export type ListPhotosParams = {
    offset: number,
    limit: number,
    storageIds: number[],
    sortBy: string,
    ascending: boolean,
};

export async function listPhotos(params: ListPhotosParams) {
    return await ApiClient.post<Photo[]>('/services/photos/list', params);
}

export type DeletePhotosParams = {
    storageId: number;
    itemIds: number[];
};

export async function deletePhotos(params: DeletePhotosParams) {
    return await ApiClient.post<{
        deleteCount: number,
        errors: {
            [itemId: number]: string;
        },
    }>('/services/photos/delete', params);
}

export type SyncParams = {
    storageId: number;
    hard?: boolean;
    force?: boolean;
};

export async function syncPhotos(params: SyncParams) {
    const params_ = {
        storageId: params.storageId.toString(),
        hard: params.hard ? 'true' : 'false',
        force: params.force ? 'true' : 'false',
    };
    return await ApiClient.get<{
        ok: boolean,
    }>('/services/photos/sync', params_);
}

export async function archivePhotos(storageId: number) {
    return await ApiClient.post<{
        ok: boolean,
    }>('/services/photos/archive', { storageId });
}

export type ImportPhotosParams = {
    fileIds: string[];
    deleteSource: boolean;
    storageId: number;
};

export type AddSuccessType = {
    addCount: number,
    errors: {
        [fileId: string]: string,
    },
};

export async function importPhotos(params: ImportPhotosParams) {
    return await ApiClient.post<AddSuccessType>('/services/photos/import', params);
}

export async function uploadPhotos(storageId: number, files: FileList) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i], files[i].name);
    }
    return await ApiClient.post<AddSuccessType>('/services/photos/upload', { storageId }, formData);
}
