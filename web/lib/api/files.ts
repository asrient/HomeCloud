import { ApiClient } from './apiClient';
import { PinnedFolder } from '../types';

export type AddPinParams = {
    storageId: number;
    folderId: string;
};

export async function addPin(params: AddPinParams) {
    return await ApiClient.post<{
        pin: PinnedFolder,
    }>('/services/files/pin/add', params);
}

export type ListPinsParams = {
    storageIds: number[];
};

export async function listPins(params: ListPinsParams) {
    return await ApiClient.post<{
        pins: PinnedFolder[],
    }>('/services/files/pin/list', params);
}
