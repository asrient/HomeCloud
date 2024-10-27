import { ApiClient } from './apiClient';
import { FileList_, Photo } from '../types';

export type ListPhotosParams = {
    offset: number,
    limit: number,
    sortBy: string,
    ascending: boolean,
    storageId: number,
};

function normalizePhoto(photo: Photo): Photo {
    return {
        ...photo,
        capturedOn: new Date(photo.capturedOn),
        addedOn: new Date(photo.addedOn),
    };
}

export async function listPhotos(params: ListPhotosParams) {
    const photos = await ApiClient.post<Photo[]>('/services/photos/list', params);
    return photos.map(normalizePhoto);
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
        deletedIds: number[],
    }>('/services/photos/delete', params);
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
    photos: Photo[],
};

export async function importPhotos(params: ImportPhotosParams) {
    const res = await ApiClient.post<AddSuccessType>('/services/photos/import', params);
    res.photos = res.photos.map(normalizePhoto);
    return res;
}

export async function uploadPhotos(storageId: number, files: FileList_) {
    // if (isDesktop()) {
    //     const filePaths = [];
    //     for (let i = 0; i < files.length; i++) {
    //         filePaths.push(files[i].path);
    //     }
    //     return await ApiClient.post<AddSuccessType>('/services/photos/upload/desktop', { storageId, filePaths });
    // }
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i], files[i].name);
    }
    const res = await ApiClient.post<AddSuccessType>('/services/photos/upload', { storageId }, formData);
    res.photos = res.photos.map(normalizePhoto);
    return res;
}
