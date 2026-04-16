import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { platform } from 'os';
import {
    AgentConfig,
    AgentInfo,
    AgentConnectionStatus,
} from 'shared/types';
import { getDefaultShell } from '../utils';

// ACP-specific capability types (not exposed to shared)
type AcpCapabilities = {
    loadSession?: boolean;
    promptCapabilities?: { image?: boolean; audio?: boolean; embeddedContext?: boolean };
    mcpCapabilities?: { http?: boolean; sse?: boolean };
    sessionCapabilities?: { list?: {} | null };
};

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params?: any;
}

interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: any;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number;
    result?: any;
    error?: { code: number; message: string; data?: any };
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

type PendingRequest = {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
};

export type AgentRequestHandler = (method: string, params: any) => Promise<any>;

/**
 * ACP Client — manages a JSON-RPC 2.0 stdio connection to an ACP Agent subprocess.
 *
 * Emits:
 *   'notification' (method: string, params: any)  — agent notifications (e.g. session/update)
 *   'status'       (status: AcpConnectionStatus, error?: string) — connection lifecycle
 *   'exit'         ()                              — process exited
 */
export class AcpClient extends EventEmitter {
    private process: ChildProcess | null = null;
    private nextRequestId = 1;
    private pendingRequests = new Map<number, PendingRequest>();
    private lineBuffer = '';
    private _status: AgentConnectionStatus = 'disconnected';
    private _agentInfo: AgentInfo | null = null;
    private _capabilities: AcpCapabilities | null = null;
    private _error: string | null = null;
    private requestHandler: AgentRequestHandler | null = null;

    get status(): AgentConnectionStatus { return this._status; }
    get agentInfo(): AgentInfo | null { return this._agentInfo; }
    get capabilities(): AcpCapabilities | null { return this._capabilities; }
    get error(): string | null { return this._error; }
    get isReady(): boolean { return this._status === 'ready'; }

    /** Register a handler for agent→client requests (e.g. permission, fs). */
    onRequest(handler: AgentRequestHandler): void {
        this.requestHandler = handler;
    }

    async connect(config: AgentConfig): Promise<void> {
        if (this._status === 'ready' || this._status === 'connecting' || this._status === 'initializing') {
            return;
        }

        this.setStatus('connecting');

        try {
            this.spawnProcess(config);
            this.setStatus('initializing');
            await this.initialize();
            this.setStatus('ready');
        } catch (err: any) {
            this.setStatus('error', err.message ?? 'Failed to connect');
            this.destroy();
            throw err;
        }
    }

    async request(method: string, params: any, timeout?: number | null): Promise<any> {
        this.ensureReady();
        return this.sendRequest(method, params, timeout);
    }

    notify(method: string, params: any): void {
        this.ensureReady();
        this.sendNotification(method, params);
    }

    destroy(): void {
        for (const [, pending] of this.pendingRequests) {
            pending.reject(new Error('Agent disconnected'));
        }
        this.pendingRequests.clear();

        if (this.process && !this.process.killed) {
            this.process.kill();
        }
        this.process = null;
        this._agentInfo = null;
        this._capabilities = null;
        this.lineBuffer = '';
    }

    // ── Private ──

    private spawnProcess(config: AgentConfig): void {
        const env: Record<string, string> = { ...process.env } as Record<string, string>;
        if (config.env) {
            for (const { name, value } of config.env) {
                env[name] = value;
            }
        }

        const shell = getDefaultShell();
        const cmdLine = [config.command, ...config.args].join(' ');
        const shellArgs = platform() === 'win32'
            ? ['-Command', cmdLine]
            : ['-l', '-c', cmdLine];

        this.process = spawn(shell, shellArgs, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env,
        });

        this.process.once('error', (err: Error) => {
            this.setStatus('error', `Failed to spawn agent: ${err.message}`);
            this.destroy();
            this.emit('exit');
        });

        this.process.on('exit', (code, signal) => {
            if (this._status !== 'disconnected') {
                this.setStatus('error', `Agent exited unexpectedly (code=${code}, signal=${signal})`);
            }
            this.destroy();
            this.emit('exit');
        });

        if (!this.process.stdout || !this.process.stdin) {
            throw new Error('Failed to get agent stdio streams');
        }

        this.process.stdout.on('data', (chunk: Buffer) => {
            this.lineBuffer += chunk.toString('utf8');
            const lines = this.lineBuffer.split('\n');
            this.lineBuffer = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) this.handleMessage(trimmed);
            }
        });

        this.process.stderr?.on('data', (chunk: Buffer) => {
            console.error(`[ACP Agent stderr] ${chunk.toString('utf8').trim()}`);
        });
    }

    private async initialize(): Promise<void> {
        const result = await this.sendRequest('initialize', {
            protocolVersion: 1,
            clientCapabilities: {
                fs: { readTextFile: false, writeTextFile: false },
                terminal: false,
            },
            clientInfo: {
                name: 'homecloud',
                title: 'HomeCloud',
                version: '1.0.0',
            },
        });

        this._agentInfo = result.agentInfo ?? null;
        this._capabilities = result.agentCapabilities ?? {};
    }

    private sendRequest(method: string, params: any, timeoutMs?: number | null): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this.nextRequestId++;
            const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
            this.pendingRequests.set(id, { resolve, reject });
            this.write(msg);

            if (timeoutMs === null) return;

            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request ${method} timed out`));
                }
            }, timeoutMs ?? 120_000);

            const original = this.pendingRequests.get(id)!;
            this.pendingRequests.set(id, {
                resolve: (v) => { clearTimeout(timeout); original.resolve(v); },
                reject: (e) => { clearTimeout(timeout); original.reject(e); },
            });
        });
    }

    private sendNotification(method: string, params: any): void {
        this.write({ jsonrpc: '2.0', method, params } as JsonRpcNotification);
    }

    private write(msg: JsonRpcMessage): void {
        if (!this.process?.stdin?.writable) {
            throw new Error('Agent process stdin is not writable');
        }
        this.process.stdin.write(JSON.stringify(msg) + '\n');
    }

    private handleMessage(line: string): void {
        let msg: any;
        try {
            msg = JSON.parse(line);
        } catch {
            console.error('[ACP] Failed to parse message:', line);
            return;
        }

        // Response to a pending request
        if ('id' in msg && msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
            const pending = this.pendingRequests.get(msg.id);
            if (pending) {
                this.pendingRequests.delete(msg.id);
                if (msg.error) {
                    pending.reject(new Error(`ACP error ${msg.error.code}: ${msg.error.message}`));
                } else {
                    pending.resolve(msg.result);
                }
            }
            return;
        }

        // Request from agent (bidirectional)
        if ('id' in msg && msg.id != null && 'method' in msg) {
            this.handleAgentRequest(msg);
            return;
        }

        // Notification from agent
        if ('method' in msg && !('id' in msg && msg.id != null)) {
            this.emit('notification', msg.method, msg.params);
            return;
        }
    }

    private async handleAgentRequest(msg: JsonRpcRequest): Promise<void> {
        if (!this.requestHandler) {
            this.write({
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32601, message: `Method not found: ${msg.method}` },
            } as any);
            return;
        }

        try {
            const result = await this.requestHandler(msg.method, msg.params);
            this.write({ jsonrpc: '2.0', id: msg.id, result } as any);
        } catch (err: any) {
            this.write({
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: err.code ?? -32603, message: err.message ?? 'Internal error' },
            } as any);
        }
    }

    private setStatus(status: AgentConnectionStatus, error?: string): void {
        this._status = status;
        this._error = error ?? null;
        this.emit('status', status, error);
    }

    private ensureReady(): void {
        if (this._status !== 'ready') {
            throw new Error(`Agent is not connected (status: ${this._status})`);
        }
    }
}
