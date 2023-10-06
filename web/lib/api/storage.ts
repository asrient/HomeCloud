import { ApiClient } from './apiClient';
import { Profile, Storage, ServerConfig, StorageAuthType, StorageType, StorageMeta } from '../types';

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
