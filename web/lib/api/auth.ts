import { ApiClient } from './apiClient';

export type LoginParams = {
    username?: string;
    password?: string;
    profileId?: string;
};

export async function login({ username, password, profileId }: LoginParams) {
    return await ApiClient.post('/profile/login', { username, password, profileId });
}

export type SignupParams = {
    name: string;
    username?: string;
    password?: string;
};

export async function signup(params: SignupParams) {
    return await ApiClient.post('/profile/create', params);
}

export async function initalialState() {
    return await ApiClient.get('/state');
}

export async function listProfiles() {
    return await ApiClient.get('/profile/list');
}
