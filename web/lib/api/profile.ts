import { ApiClient } from './apiClient';
import { Profile } from '../types';

export type UpdateProfileProtected = {
    password: string;
    newPassword?: string;
    username?: string;
    isDisabled?: boolean;
};

export async function updateProfileProtected(params: UpdateProfileProtected) {
    return await ApiClient.post<{ profile: Profile }>('/profile/update/protected', params);
}

export type UpdateProfile = {
    name?: string;
};

export async function updateProfile(params: UpdateProfile) {
    return await ApiClient.post<{ profile: Profile }>('/profile/update', params);
}
