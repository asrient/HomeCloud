import { envConfig, StorageAuthType, StorageType } from "../envConfig";
import https from 'https';
import tls from 'tls';
import CustomError, { ErrorCode, ErrorResponse } from "../customError";
import { URLSearchParams } from 'url';
import { createPairingRequest, createPairingRequestPacket, PairingRequestPacket } from "./pairing";
import { Agent, Storage } from "../models";
import { Readable } from 'node:stream';
import { AgentInfo, PairingRequest } from "./types";
import { getFingerprintFromBase64 } from "../utils/cryptoUtils";
import { AGENT_TOKEN_HEADER, ApiRequest, ApiResponse, WEB_TOKEN_HEADER } from "../interface";
import { IncomingMessage } from "http";
import { streamToBuffer, streamToJson, streamToString } from "../utils";
import FormData from 'form-data';

export type ErrorData = {
    message: string;
    errors?: { [key: string]: string[] };
};

class CustomHttpsAgent extends https.Agent {
    public _serverFingerprint: string | null;
    createConnection(options, callback) {
        // Use tls.connect to manually handle server certificates
        const socket = tls.connect(options, () => {
            const cert = socket.getPeerCertificate();
            const publicKey = cert.pubkey.toString('base64');
            const fingerprint = getFingerprintFromBase64(publicKey);
            // Custom certificate validation logic
            if (this._serverFingerprint && fingerprint !== this._serverFingerprint) {
                console.log('Certificate validation failed');
                socket.destroy(CustomError.security('Server fingerprint mismatch', { fingerprint, expected: this._serverFingerprint }));
                return;
            }
            this._serverFingerprint = fingerprint;
            // Proceed if validation passed
            callback(null, socket);
        });

        // Handle errors
        socket.on('error', (err) => {
            console.error('Socket error:', err);
            callback(err, null);
        });

        return socket;
    }
}

// Adopted from web apiClient
export class AgentClient {
    private _httpsAgent: CustomHttpsAgent;
    private _accessKey: string | null;
    private _host: string;
    constructor(host: string, serverFingerprint: string | null, accessKey: string | null) {
        this._host = host;
        this._accessKey = accessKey;
        this._httpsAgent = new CustomHttpsAgent({
            cert: envConfig.CERTIFICATE_PEM, // Client certificate
            key: envConfig.PRIVATE_KEY_PEM, // Client private key
            rejectUnauthorized: false, // Disable automatic rejection of unauthorized certs
        });
        this._httpsAgent._serverFingerprint = serverFingerprint;
    }

    setHost(host: string) {
        this._host = host;
    }

    getHost(): string {
        return this._host;
    }

    setServerFingerprint(fingerprint: string) {
        this._httpsAgent._serverFingerprint = fingerprint;
    }

    getServerFingerprint(): string | null {
        return this._httpsAgent._serverFingerprint;
    }

    setAccessKey(accessKey: string) {
        this._accessKey = accessKey;
    }

    getAccessKey(): string | null {
        return this._accessKey;
    }

    private async _request({ method, path, params, body, headers }: { method: string, path: string, params?: any, body?: any, headers?: { [key: string]: string } }): Promise<IncomingMessage> {
        if (params && typeof params === 'object' && Object.keys(params).length > 0) {
            const query = new URLSearchParams(params);
            path += '?' + query.toString();
        }

        const bodyType = typeof body;
        const isBodyStream = body instanceof Readable;
        const isBodyFormData = body instanceof FormData;

        if (isBodyFormData) {
            // If the body is FormData, we need to set the content-type header here
            headers = headers || {};
            Object.assign(headers, body.getHeaders());
        }

        headers = headers || {
            'Content-Type': bodyType === 'string' ? 'text/plain' : 'application/json',
        };

        if (this.getAccessKey()) {
            headers[AGENT_TOKEN_HEADER] = this.getAccessKey();
        }

        // Create options for the HTTPS request
        const options: https.RequestOptions = {
            method,
            hostname: this._host,
            port: envConfig.AGENT_PORT,
            path: `/${path}`,
            headers,
            agent: this._httpsAgent,
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                resolve(res);
            });

            req.on('error', (e) => {
                reject(CustomError.code(ErrorCode.AGENT_NETWORK, e.message));
            });

            // Handle the request body
            if (body) {
                if (isBodyStream) {
                    // If the body is a Readable stream, pipe it to the request
                    body.pipe(req);
                    // Don't call `req.end()` here because the stream will handle ending
                    body.on('end', () => req.end());
                } else if (body instanceof FormData) {
                    // If the body is FormData, use FormData's stream capabilities
                    body.pipe(req);
                } else {
                    // Otherwise, treat it as JSON and write it, then end the request
                    req.write(JSON.stringify(body));
                    req.end();
                }
            } else {
                // End the request if there's no body
                req.end();
            }
        });
    }

    async _parseResponse<T>(response: IncomingMessage): Promise<T> {
        const isJson = response.headers["content-type"]?.includes('application/json');
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            if (isJson) {
                const data: ErrorResponse = await streamToJson(response) as ErrorResponse;
                throw CustomError.fromErrorResponse(data.error);
            }
            throw CustomError.code(ErrorCode.AGENT_NETWORK, response.statusMessage, { status: response.statusCode });
        }
        if (isJson) {
            const keyHeader = Array.isArray(response.headers['x-access-key']) ? response.headers['x-access-key'][0] : response.headers['x-access-key'];
            if (keyHeader) {
                this.setAccessKey(keyHeader);
            }
            return await streamToJson(response) as T;
        }
        const isText = response.headers['content-type']?.includes('text/plain');
        if (isText) {
            return await streamToString(response) as T;
        }
        return new Blob([await streamToBuffer(response)]) as T;
    }

    async _get<T>(path: string, params?: string | string[][] | Record<string, string> | URLSearchParams): Promise<IncomingMessage> {
        return await this._request({ method: 'GET', path, params });
    }

    async get<T>(path: string, params?: string | string[][] | Record<string, string> | URLSearchParams): Promise<T> {
        return this._parseResponse<T>(await this._get(path, params));
    }

    async getToStream(path: string, params?: string | string[][] | Record<string, string> | URLSearchParams): Promise<{ mime: string; stream: Readable }> {
        const resp = await this._get(path, params);
        const mime = resp.headers['content-type'] || 'application/octet-stream';
        return { mime, stream: resp };
    }

    async _post<T>(path: string, params?: any, body?: any): Promise<IncomingMessage> {
        if (!body) {
            body = params;
            params = undefined;
        }
        return await this._request({ method: 'POST', path, params, body });
    }

    async post<T>(path: string, params?: any, body?: any): Promise<T> {
        return this._parseResponse<T>(await this._post(path, params, body));
    }

    async postToStream(path: string, params?: any, body?: any): Promise<{ mime: string; stream: Readable }> {
        const resp = await this._post(path, params, body);
        const mime = resp.headers['content-type'] || 'application/octet-stream';
        return { mime, stream: resp };
    }

    async relayApiRequest(req: ApiRequest): Promise<ApiResponse> {
        let body: any;
        if (req.mayContainFiles) {
            body = req.bodyStream;
        }
        else if (req.isJson) {
            if (req.local.json) {
                body = req.local.json;
            } else {
                body = await req.json();
            }
        }
        else if (req.isText) {
            body = await req.text();
        }
        else {
            body = await req.body();
        }
        const reqPath = req.path.startsWith('/') ? req.path.substring(1) : req.path;
        const headers = Object.assign({}, req.headers);
        delete headers[WEB_TOKEN_HEADER];
        delete headers['cookie'];
        const response = await this._request({ method: req.method, path: reqPath, params: req.getParams, body, headers: req.headers });
        const apiResponse = new ApiResponse();
        apiResponse.statusCode = response.statusCode;
        apiResponse.stream(response, response.headers['content-type'] || 'application/octet-stream');
        return apiResponse;
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

async function createStorage(client: AgentClient, accessKey: string) {
    client.setAccessKey(accessKey);
    const targetInfo = await getAgentInfo(client);
    const agent = await Agent.createAgent({
        fingerprint: client.getServerFingerprint(),
        deviceName: targetInfo.deviceName,
        iconKey: targetInfo.iconKey,
        authority: client.getHost(),
    });
    const storage = await Storage.createStorage({
        type: StorageType.Agent,
        name: `${targetInfo.deviceName}`,
        authType: StorageAuthType.Pairing,
        oneAuthId: null,
        username: null,
        secret: accessKey,
        url: null,
        Agent: agent,
    });

    return storage;
}

export async function requestPairing(host: string, serverFingerprint: string, password: string | null = null):
    Promise<{ storage: Storage | null, token: string | undefined }> {
    const client = new AgentClient(host, serverFingerprint, null);
    const pairingRequest: PairingRequest = createPairingRequest(serverFingerprint);
    const packet: PairingRequestPacket = createPairingRequestPacket(pairingRequest);
    const data = await client.post<{
        accessKey?: string;
        token?: string;
    }>('api/agent/pair', { packet, password });
    let storage: Storage | null = null;
    if (data.accessKey) {
        storage = await createStorage(client, data.accessKey);
    }
    return { storage, token: data.token };
}

export async function sendOTP(host: string, serverFingerprint: string, token: string, otp: string) {
    const client = new AgentClient(host, serverFingerprint, null);
    const data = await client.post<{
        accessKey: string;
    }>('api/agent/otp', { token, otp });
    return createStorage(client, data.accessKey);
}
