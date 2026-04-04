import { MessagePort } from 'worker_threads';
import * as Comlink from 'comlink';
import nodeEndpoint from 'comlink/dist/umd/node-adapter';
import { getMethodInfo } from 'shared/servicePrimatives.js';
import { getPartionedTmpDir } from '../utils.js';
import { shortId } from './repository.js';
import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';

/**
 * Defines the methods exposed to workflow worker threads via Comlink.
 * Each method is callable from the worker as `await host.ping()`.
 */
export class WorkerInterface {
    #tmpDir: string;

    constructor(executionId: string) {
        this.#tmpDir = path.join(getPartionedTmpDir('workflow'), executionId);
    }

    async cleanup(): Promise<void> {
        await fsp.rm(this.#tmpDir, { recursive: true, force: true }).catch(() => { });
    }

    async ping(): Promise<string> {
        return 'pong';
    }

    async #streamToTmpFile(stream: ReadableStream): Promise<string> {
        await fsp.mkdir(this.#tmpDir, { recursive: true });
        const filePath = path.join(this.#tmpDir, shortId());
        const writeable = fs.createWriteStream(filePath);
        const reader = stream.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                writeable.write(value);
            }
        } finally {
            reader.releaseLock();
            writeable.end();
        }
        return filePath;
    }

    async #replaceStreams(value: any): Promise<any> {
        if (value === null || value === undefined) return value;
        if (value instanceof ReadableStream) {
            const tmpFile = await this.#streamToTmpFile(value);
            return { tmpFile };
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

    #methodCall(target: any, methodName: string, args: any[]): Promise<any> {
        return target[methodName](...args);
    }

    async callApi(fingerprint: string | null, fqn: string, args: any[] = []): Promise<any> {
        let result: any;
        if (!fingerprint) {
            const controller = modules.getLocalServiceController();
            const { obj, funcName } = controller.getCallable('services.' + fqn);
            const methodInfo = getMethodInfo(obj[funcName]);
            if (!methodInfo.isExposed) {
                throw new Error(`Method not exposed: ${fqn}`);
            }
            result = await this.#methodCall(obj, funcName, args);
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
            result = await this.#methodCall(target, method, args);
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
