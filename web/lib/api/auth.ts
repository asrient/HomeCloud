import { ApiClient } from './apiClient';
import { Profile, Storage, ServerConfig } from '../types';

export type LoginParams = {
    username?: string;
    password?: string;
    profileId?: number;
};

export async function login({ username, password, profileId }: LoginParams) {
    return await ApiClient.post<{ profile: Profile }>('/profile/login', { username, password, profileId });
}

export type SignupParams = {
    name: string;
    username?: string;
    password?: string;
};

export async function signup(params: SignupParams) {
    return await ApiClient.post<{ profile: Profile }>('/profile/create', params);
}

export type StateResponse = {
    config: ServerConfig;
    profile: Profile;
    storages: Storage[];
};

export async function initalialState() {
    return await ApiClient.get<StateResponse>('/state');
}

export async function listProfiles() {
    return await ApiClient.get<{ profiles: Profile[] }>('/profile/list');
}
