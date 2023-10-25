import { ApiClient } from './apiClient';
import { Storage, StorageAuthType, StorageType, StorageMeta } from '../types';

export type AddStorageParams = {
    name: string;
    authType: StorageAuthType;
    type: StorageType;
    url?: string;
    username?: string;
    secret?: string;
};

export type PendingAuth = {
    id: number;
    referenceId: string;
    storageType: StorageType;
    expiresOn: Date;
}

export async function addStorage(params: AddStorageParams) {
    return await ApiClient.post<{
        storage?: Storage,
        pendingAuth?: PendingAuth,
        authUrl?: string,
    }>('/storage/add', params);
}

export type StorageCallbackParams = {
    referenceId: string;
    partialCode2: string;
};

export async function storageCallback(params: StorageCallbackParams) {
    return await ApiClient.get<{ storage: Storage }>('/storage/callback', params);
}

export type ServiceScanParams = {
    storageId: number;
    force?: boolean;
};

export async function serviceScan(params: ServiceScanParams) {
    const { storageId, force } = params;
    const req = {
        storageId: storageId.toString(),
        force: force ? 'true' : 'false',
    }
    return await ApiClient.get<{
        storageMeta: StorageMeta,
    }>('/services/scan', req);
}

export type EditStorageParams = {
    storageId: number;
    name?: string;
    authType?: StorageAuthType;
    url?: string;
    username?: string;
    secret?: string;
};

export async function editStorage(params: EditStorageParams) {
    return await ApiClient.post<{ storage: Storage }>('/storage/edit', params);
}

export async function deleteStorage(storageId: number) {
    return await ApiClient.post<{
        deleted: true,
        storageId: number,
    }>('/storage/delete', { storageId });
}
