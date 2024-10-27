import { ApiClient } from './apiClient';
import { Profile, Storage, ServerConfig, DeviceInfo } from '../types';

export type RequestSessionParams = {
    fingerprint: string;
};

export async function requestSession(params: RequestSessionParams) {
    return await ApiClient.post<{ token: string }>('/session/request', params);
}

export type PollSessionParams = {
    fingerprint: string;
    token: string;
};

export async function pollSession(params: PollSessionParams) {
    return await ApiClient.post<{ status: boolean; profile?: Profile; }>('/session/pollStatus', params);
}

export type StateResponse = {
    config: ServerConfig;
    deviceInfo: DeviceInfo;
    profile: Profile | null;
    storages: Storage[] | null;
};

export async function initalialState() {
    return await ApiClient.get<StateResponse>('/state');
}

export async function logout() {
    return await ApiClient.post<{
        profile: Profile;
        ok: boolean;
    }>('/session/exit');
}
