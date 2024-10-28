import { ApiClient } from './apiClient';
import { Storage, StorageAuthType, StorageType } from '../types';
import { boolean } from 'zod';

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

export type PairParams = {
    host: string;
    fingerprint: string;
    targetProfileId: number;
    password?: string;
};

export async function pairStorage(params: PairParams) {
    return await ApiClient.post<{
        requireOTP: boolean;
        storage?: Storage;
        token?: string;
    }>('/storage/pair', params);
}

export type OTPParams = {
    token: string;
    otp: string;
    host: string;
    fingerprint: string;
};

export async function sendOTP(params: OTPParams) {
    return await ApiClient.post<{
        storage: Storage;
    }>('/storage/otp', params);
}
