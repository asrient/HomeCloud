import { envConfig, StorageAuthType, StorageType } from "../envConfig";
import https from 'https';
import fetch, { RequestInit, HeadersInit, Response } from 'node-fetch';
import CustomError, { ErrorCode, ErrorResponse } from "../customError";
import { URLSearchParams } from 'url';
import { createPairingRequest, createPairingRequestPacket, PairingRequest, PairingRequestPacket } from "./pairing";
import { Profile, ProfileDetails, Agent, Storage } from "../models";
import FormData from "form-data";
import { Readable } from 'node:stream';
import { AgentInfo } from "./types";

export type ErrorData = {
    message: string;
    errors?: { [key: string]: string[] };
};

// Adopted from web apiClient
export class AgentClient {
    static PORT = 5001;
    private _httpsAgent: https.Agent;
    private _serverFingerprint: string | null;
    private _accessKey: string | null;
    private _host: string;
    constructor(host: string, serverFingerprint: string | null, accessKey: string | null) {
        this._host = host;
        this._serverFingerprint = serverFingerprint;
        this._accessKey = accessKey;
        this._httpsAgent = new https.Agent({
            cert: envConfig.CERTIFICATE, // Client certificate
            key: envConfig.PRIVATE_KEY, // Client private key
            rejectUnauthorized: false,
            checkServerIdentity: (host, cert) => {
                const fingerprint = cert.fingerprint256;  // Get the SHA-256 fingerprint of the certificate

                if (this._serverFingerprint && fingerprint !== this._serverFingerprint) {
                    throw CustomError.security('Server fingerprint mismatch', { fingerprint, expected: this._serverFingerprint });
                }
                this._serverFingerprint = fingerprint;
                return undefined;  // Continue connection if the fingerprint matches
            }
        });
    }

    setHost(host: string) {
        this._host = host;
    }

    getHost(): string {
        return this._host;
    }

    setServerFingerprint(fingerprint: string) {
        this._serverFingerprint = fingerprint;
    }

    getServerFingerprint(): string | null {
        return this._serverFingerprint;
    }

    setAccessKey(accessKey: string) {
        this._accessKey = accessKey;
    }

    getAccessKey(): string | null {
        return this._accessKey;
    }

    private async _request(method: string, path: string, params?: any, body?: any): Promise<Response> {
        if (params) {
            const query = new URLSearchParams(params);
            path += '?' + query.toString();
        }
        const fetchOptions: RequestInit = {
            method,
            agent: this._httpsAgent,
        };
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };
        if (this.getAccessKey()) {
            headers['x-access-key'] = this.getAccessKey();
        }
        if (body) {
            if (FormData.prototype.isPrototypeOf(body)) {
                // console.log('fetch: form data');
                fetchOptions.body = body;
                delete headers['Content-Type'];
            } else {
                fetchOptions.body = JSON.stringify(body);
            }
        }
        fetchOptions.headers = headers;
        try {
            return await fetch(`https://${this._host}:${AgentClient.PORT}/${path}`, fetchOptions);
        } catch (e) {
            throw CustomError.code(ErrorCode.AGENT_NETWORK, e.message);
        }
    }

    async _parseResponse<T>(response: Response): Promise<T> {
        const isJson = response.headers.get('Content-Type')?.includes('application/json');
        if (!response.ok) {
            if (isJson) {
                const data: ErrorResponse = await response.json() as ErrorResponse;
                throw CustomError.fromErrorResponse(data.error);
            }
            throw CustomError.code(ErrorCode.AGENT_NETWORK, response.statusText, { status: response.status });
        }
        if (isJson) {
            const keyHeader = response.headers.get('x-access-key');
            if (keyHeader) {
                this.setAccessKey(keyHeader);
            }
            return await response.json() as T;
        }
        const isText = response.headers.get('Content-Type')?.includes('text/plain');
        if (isText) {
            return await response.text() as T;
        }
        return await response.blob() as T;
    }

    async _get<T>(path: string, params?: string | string[][] | Record<string, string> | URLSearchParams): Promise<Response> {
        return await this._request('GET', path, params);
    }

    async get<T>(path: string, params?: string | string[][] | Record<string, string> | URLSearchParams): Promise<T> {
        return this._parseResponse<T>(await this._get(path, params));
    }

    async getToStream(path: string, params?: string | string[][] | Record<string, string> | URLSearchParams): Promise<{mime: string; stream: Readable }> {
        const resp = await this._get(path, params);
        const mime = resp.headers.get('Content-Type') || 'application/octet-stream';
        const stream = new Readable().wrap(resp.body);
        return { mime, stream };
    }

    async _post<T>(path: string, params?: any, body?: any): Promise<Response> {
        if (!body) {
            body = params;
            params = undefined;
        }
        return await this._request('POST', path, params, body);
    }

    async post<T>(path: string, params?: any, body?: any): Promise<T> {
        return this._parseResponse<T>(await this._post(path, params, body));
    }

    async postToStream(path: string, params?: any, body?: any): Promise<{mime: string; stream: Readable }> {
        const resp = await this._post(path, params, body);
        const mime = resp.headers.get('Content-Type') || 'application/octet-stream';
        const stream = new Readable().wrap(resp.body);
        return { mime, stream };
    }
}

export async function getClientFromStorage(storage: Storage): Promise<AgentClient> {
    const agent = await storage.getAgent();
    if (!agent) {
        throw new Error('Agent not found');
    }
    // todo: code to update host ip according current network and bonjour.
    return new AgentClient(agent.authority, agent.fingerprint, storage.secret);
}

export async function getAgentInfo(client: AgentClient): Promise<AgentInfo> {
    return await client.get<AgentInfo>('api/agent/info');
}

// Pairing related functions

async function createStorage(profile: Profile, client: AgentClient, accessKey: string) {
    client.setAccessKey(accessKey);
    const targetInfo = await getAgentInfo(client);
    if (!targetInfo.profile) {
        throw CustomError.validationSingle('profile', 'Profile not found in target info response');
    }
    const agent = await Agent.createAgent(profile, {
        fingerprint: client.getServerFingerprint(),
        deviceName: targetInfo.deviceName,
        remoteProfileId: targetInfo.profile.id,
        remoteProfileName: targetInfo.profile.name,
        authority: client.getHost(),
    });
    const storage = await Storage.createStorage(profile, {
        type: StorageType.Agent,
        name: `${targetInfo.deviceName} (${targetInfo.profile.name})`,
        authType: StorageAuthType.Pairing,
        oneAuthId: null,
        username: null,
        secret: accessKey,
        url: null,
        Agent: agent,
    });

    return storage;
}

export async function requestPairing(profile: Profile, host: string, serverFingerprint: string, targetProfileId: number, password: string | null = null):
    Promise<{ storage: Storage | null, token: string | undefined }> {
    const client = new AgentClient(host, serverFingerprint, null);
    const pairingRequest: PairingRequest = createPairingRequest(profile, {
        profileId: targetProfileId,
        fingerprint: serverFingerprint,
    });
    const packet: PairingRequestPacket = createPairingRequestPacket(pairingRequest);
    const data = await client.post<{
        accessKey?: string;
        token?: string;
    }>('api/agent/pair', { packet, password });
    let storage: Storage | null = null;
    if (data.accessKey) {
        storage = await createStorage(profile, client, data.accessKey);
    }
    return { storage, token: data.token };
}

export async function sendOTP(profile: Profile, host: string, serverFingerprint: string, token: string, otp: string) {
    const client = new AgentClient(host, serverFingerprint, null);
    const data = await client.post<{
        accessKey: string;
    }>('api/agent/otp', { token, otp });
    return createStorage(profile, client, data.accessKey);
}
