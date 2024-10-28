import { ApiClient } from './apiClient';
import { AgentInfo } from '../types';

export type AgentInfoParams = {
    host: string;
    fingerprint?: string;
};

export async function getAgentInfo(params: AgentInfoParams) {
    return await ApiClient.post<AgentInfo>('/discovery/agentInfo', params);
}

export type ScanParams = {
    storageId: number;
    folderId: string;
};

export async function scan(force = false) {
    return await ApiClient.get<{}>('/discovery/scan', { force: force.toString() }); // todo: implement scan
}
