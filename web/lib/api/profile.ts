import { ApiClient } from './apiClient';
import { Profile } from '../types';

export type UpdateProfile = {
    profileId: number;
    storageId?: number;
    password?: string;
    username?: string;
    isDisabled?: boolean;
    name?: string;
    isAdmin?: boolean;
    accessControl?: { [key: string]: string } | null;
};

export async function updateProfile(params: UpdateProfile) {
    return await ApiClient.post<{ profile: Profile }>('/profile/update', params);
}

export async function listProfiles(storageId: number) {
    return await ApiClient.get<{ profiles: Profile[] }>('/profile/list', { storageId: storageId.toString() });
}

export type CreateProfileParams = {
    storageId?: number;
    name: string;
    username?: string;
    password?: string;
    isAdmin?: boolean;
    accessControl?: { [key: string]: string };
};

export async function createProfile(params: CreateProfileParams) {
    return await ApiClient.post<{ profile: Profile }>('/profile/create', params);
}

export type DeleteProfileParams = {
    password?: string;
    profileIds: number[];
    storageId?: number;
};

export async function deleteProfile(params: DeleteProfileParams) {
    return await ApiClient.post<{ count: number; logout: boolean; }>('/profile/delete', params);
}
