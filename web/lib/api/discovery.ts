import { ApiClient } from './apiClient';
import { AgentCandidate, AgentInfo } from '../types';

export type AgentInfoParams = {
    host: string;
    fingerprint?: string;
};

export async function getAgentInfo(params: AgentInfoParams) {
    return await ApiClient.post<AgentInfo>('/discovery/agentInfo', params);
}

export async function scan(force = false) {
    return await ApiClient.get<AgentCandidate[]>('/discovery/scan', {
        force: force.toString(),
    });
}
