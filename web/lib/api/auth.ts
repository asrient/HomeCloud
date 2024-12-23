import { ApiClient } from './apiClient';
import { Storage, ServerConfig, DeviceInfo } from '../types';

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
    return await ApiClient.post<{ status: boolean; }>('/session/pollStatus', params);
}

export type StateResponse = {
    config: ServerConfig;
    deviceInfo: DeviceInfo;
    iconKey: string | null;
    storages: Storage[] | null;
    isAuthenticated: boolean;
};

export async function initalialState() {
    return await ApiClient.get<StateResponse>('/state');
}

export async function logout() {
    return await ApiClient.post<{
        ok: boolean;
    }>('/session/exit');
}
