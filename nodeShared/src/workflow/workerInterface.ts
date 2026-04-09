import { MessagePort } from 'worker_threads';
import * as Comlink from 'comlink';
import nodeEndpoint from 'comlink/dist/umd/node-adapter';
import { getMethodInfo } from 'shared/servicePrimatives.js';
import { PeerInfo, SimpleSchema, WorkflowConfig } from 'shared/types.js';
import { shortId, WorkflowRepository } from './repository.js';
import fs from 'fs';
import { Readable } from 'stream';

/**
 * Defines the methods exposed to workflow worker threads via Comlink.
 * Each method is callable from the worker as `await host.ping()`.
 */
export class WorkerInterface {
    #repo: WorkflowRepository | null;
    #config: WorkflowConfig | undefined;

    constructor(executionId: string, repo?: WorkflowRepository, config?: WorkflowConfig) {
        this.#repo = repo ?? null;
        this.#config = config;
    }

    async cleanup(): Promise<void> {
        for (const reader of this.#streams.values()) {
            try { reader.cancel(); } catch { }
        }
        this.#streams.clear();
        for (const ctrl of this.#inputStreams.values()) {
            try { ctrl.close(); } catch { }
        }
        this.#inputStreams.clear();
    }

    async ping(): Promise<string> {
        return 'pong';
    }

    async getSecret(key: string): Promise<string | null> {
        if (!this.#repo) throw new Error('Secrets not available');
        if (!this.#config?.permissions?.secrets) {
            throw new Error('No secret read permission');
        }
        return this.#repo.getSecret(key);
    }

    async setSecret(key: string, value: string): Promise<void> {
        if (!this.#repo) throw new Error('Secrets not available');
        if (this.#config?.permissions?.secrets !== 'write') {
            throw new Error('No secret write permission');
        }
        return this.#repo.setSecret(key, value);
    }

    // Active stream readers keyed by ID, pulled by worker via readStreamChunk()
    #streams = new Map<string, ReadableStreamDefaultReader>();

    async #replaceStreams(value: any): Promise<any> {
        if (value === null || value === undefined) return value;
        if (value instanceof ReadableStream) {
            const id = shortId();
            this.#streams.set(id, value.getReader());
            return { __stream: id };
        }
        if (Array.isArray(value)) {
            return Promise.all(value.map(item => this.#replaceStreams(item)));
        }
        if (typeof value === 'object' && value.constructor === Object) {
            const result: any = {};
            for (const key of Object.keys(value)) {
                result[key] = await this.#replaceStreams(value[key]);
            }
            return result;
        }
        return value;
    }

    /** Called by worker to pull the next chunk from a stream. */
    async readStreamChunk(id: string): Promise<{ done: boolean; value?: Uint8Array }> {
        const reader = this.#streams.get(id);
        if (!reader) throw new Error(`Stream not found: ${id}`);
        const { done, value } = await reader.read();
        if (done) {
            this.#streams.delete(id);
            return { done: true };
        }
        return { done: false, value };
    }

    // --- Input streams: worker pushes chunks to host via postStreamChunk/endStream ---
    #inputStreams = new Map<string, ReadableStreamDefaultController>();

    /** Called by worker to push a chunk into an input stream. */
    async postStreamChunk(id: string, data: Uint8Array): Promise<void> {
        const ctrl = this.#inputStreams.get(id);
        if (!ctrl) throw new Error(`Input stream not found: ${id}`);
        ctrl.enqueue(data);
    }

    /** Called by worker to signal end of an input stream. */
    async endStream(id: string, error?: string): Promise<void> {
        const ctrl = this.#inputStreams.get(id);
        if (!ctrl) return;
        if (error) ctrl.error(new Error(error));
        else ctrl.close();
        this.#inputStreams.delete(id);
    }

    /**
     * Recursively resolve input args against schema:
     * - Where schema.type === 'stream': convert { __stream: id } marker or file path to ReadableStream
     * - Recurse into objects using schema.properties
     * - Recurse into arrays using schema.items
     */
    #resolveInputStreams(value: any, schema?: SimpleSchema): any {
        if (value === null || value === undefined || !schema) return value;
        if (schema.type === 'stream') {
            // Worker-pushed stream via { __stream: id }
            if (value?.__stream) {
                const id = value.__stream;
                let ctrl: ReadableStreamDefaultController;
                const stream = new ReadableStream({
                    start(c) { ctrl = c; }
                });
                this.#inputStreams.set(id, ctrl!);
                return stream;
            }
            // File path fallback
            if (typeof value === 'string') {
                return Readable.toWeb(fs.createReadStream(value)) as ReadableStream;
            }
        }
        if (schema.type === 'object' && schema.properties && typeof value === 'object' && !Array.isArray(value)) {
            const result: any = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = this.#resolveInputStreams(v, schema.properties[k]);
            }
            return result;
        }
        if (schema.type === 'array' && schema.items && Array.isArray(value)) {
            return value.map(item => this.#resolveInputStreams(item, schema.items));
        }
        return value;
    }

    #methodCall(target: any, methodName: string, args: any[]): Promise<any> {
        return target[methodName](...args);
    }

    async callApi(fingerprint: string | null, fqn: string, args: any[] = []): Promise<any> {
        let result: any;
        const controller = modules.getLocalServiceController();
        const { obj, funcName } = controller.getCallable('services.' + fqn);
        const methodInfo = getMethodInfo(obj[funcName]);
        if (!methodInfo.isWfApi) {
            throw new Error(`Method not available to workflows: ${fqn}`);
        }
        // Resolve file paths to ReadableStreams where schema expects stream type
        const inputSchemas = methodInfo.inputSchema ?? [];
        const resolvedArgs = args.map((arg, i) => this.#resolveInputStreams(arg, inputSchemas[i]));
        if (!fingerprint) {
            result = await this.#methodCall(obj, funcName, resolvedArgs);
        } else {
            // Remote: RPC server enforces @exposed on its side
            const controller = await modules.getRemoteServiceController(fingerprint);
            const parts = fqn.split('.');
            let target: any = controller;
            for (let i = 0; i < parts.length - 1; i++) {
                target = target[parts[i]];
                if (!target) throw new Error(`Invalid FQN: ${fqn}`);
            }
            const method = parts[parts.length - 1];
            if (typeof target[method] !== 'function') {
                throw new Error(`Method not found: ${fqn}`);
            }
            result = await this.#methodCall(target, method, resolvedArgs);
        }

        return this.#replaceStreams(result);
    }
}

/**
 * Exposes a WorkerInterface instance to a worker via a MessagePort using Comlink.
 */
export function exposeWorkerInterface(port: MessagePort, iface: WorkerInterface): void {
    Comlink.expose(iface, nodeEndpoint(port) as any);
}
