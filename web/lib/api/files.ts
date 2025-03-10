import { ApiClient } from './apiClient';
import { PinnedFolder, RemoteItem } from '../types';

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

export async function getThumbnail(storageId: number, fileId: string) {
    return await ApiClient.post<string>('/services/thumb/getThumbnail', { storageId, fileId });
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

export type OpenFileRemoteParams = {
    storageId: number;
    fileId: string;
    targetDeviceFingerprint: string;
}

export async function openFileRemote(params: OpenFileRemoteParams) {
    return await ApiClient.post<{ id: string }>('/services/files/open/remote', params);
}

export type MoveParams = {
    sourceStorageId: number,
    destStorageId: number,
    sourceFileIds: string[],
    destDir: string,
    deleteSource: boolean,
}

export async function move(params: MoveParams) {
    return await ApiClient.post<{ errors: string[], items: RemoteItem[] }>('/services/files/move', params);
}
