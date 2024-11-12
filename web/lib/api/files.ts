import { ApiClient } from './apiClient';
import { PinnedFolder } from '../types';

export type AddPinParams = {
    storageId: number;
    folderId: string;
};

export async function addPin(params: AddPinParams) {
    return await ApiClient.post<{
        pin: PinnedFolder,
        ok: boolean,
    }>('/services/files/pin/add', params);
}

export type RemovePinParams = {
    storageId: number;
    folderId: string;
};

export async function removePin(params: RemovePinParams) {
    return await ApiClient.post<{
        ok: boolean,
    }>('/services/files/pin/remove', params);
}

export type ListPinsParams = {
    storageId: number;
};

export async function listPins(params: ListPinsParams) {
    return await ApiClient.post<{
        pins: PinnedFolder[],
    }>('/services/files/pin/list', params);
}

export type ThumbnailResponse = {
    fileId: string,
    updatedAt: Date | null,
    image: string,
    height: number | null,
    width: number | null
}

export async function getThumbnail(storageId: number, fileId: string) {
    return await ApiClient.post<ThumbnailResponse>('/services/thumb/getThumbnail', { storageId, fileId });
}

export async function fileAccessToken(storageId: number, fileId: string) {
    return await ApiClient.post<{ token: string }>('/services/files/fileToken', { storageId, fileId });
}

export async function downloadFile(storageId: number, fileId: string) {
    return await ApiClient.post<{ id: string }>('/services/files/download', { storageId, fileId });
}

export async function openFileLocal(storageId: number, fileId: string) {
    return await ApiClient.post<{ id: string }>('/services/files/open/local', { storageId, fileId });
}

export async function openFileRemote(storageId: number, fileId: string) {
    return await ApiClient.post<{ id: string }>('/services/files/open/remote', { storageId, fileId });
}
