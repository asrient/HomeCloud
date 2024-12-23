import { ApiClient } from './apiClient';
import { FileList_, Photo, PhotoLibrary } from '../types';

export type ListPhotosParams = {
    offset: number,
    limit: number,
    sortBy: string,
    ascending: boolean,
    storageId: number,
    libraryId: number,
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
    libraryId: number;
    ids: number[];
};

export async function deletePhotos(params: DeletePhotosParams) {
    return await ApiClient.post<{
        deleteCount: number,
        deletedIds: number[],
    }>('/services/photos/delete', params);
}

type PhotoLibraryPrimative = Omit<PhotoLibrary, "storageId">;

function normalizePhotoLibrary(library: PhotoLibraryPrimative, storageId: number): PhotoLibrary {
    return {
        ...library,
        storageId,
    };
}

export type AddLibraryParams = {
    storageId: number;
    name: string;
    location: string;
};

export async function addLibrary(params: AddLibraryParams) {
    const ph = await ApiClient.post<PhotoLibrary>('/services/photos/library/add', params);
    return normalizePhotoLibrary(ph, params.storageId);
}

export type DeleteLibraryParams = {
    storageId: number;
    id: number;
};

export async function deleteLibrary(params: DeleteLibraryParams) {
    return await ApiClient.post<{
        deletedId: number;
    }>('/services/photos/library/delete', params);
}

export async function getLibraries(storageId: number) {
    const phs = await ApiClient.get<PhotoLibrary[]>('/services/photos/library/list', { storageId: storageId.toString() });
    return phs.map((ph) => normalizePhotoLibrary(ph, storageId));
}
