import { DataChannelParser } from './DataChannelParser';
import { ProxyHandlers, GenericDataChannel } from './types';
import { isDebug, fp } from './utils';

// ----- Message Types -----
export enum MessageType {
    REQUEST = 0x01,
    RESPONSE = 0x02,
    ERROR = 0x03,
    AUTH_CHALLENGE = 0x04,
    AUTH_RESPONSE = 0x05,
    STREAM_CHUNK = 0x06,
    STREAM_END = 0x07,
    STREAM_CANCEL = 0x08,
    HELLO = 0x09,
    READY = 0x0A,
    SIGNAL_SUBSCRIBE = 0x0B,
    SIGNAL_UNSUBSCRIBE = 0x0C,
    SIGNAL_EVENT = 0x0D,
    PING = 0x0E,
}

const SETUP_AUTH_TYPES = [
    MessageType.AUTH_CHALLENGE,
    MessageType.AUTH_RESPONSE,
    MessageType.HELLO,
    MessageType.READY,
]

// ----- Types -----
type PendingCall = {
    resolve: (val: any) => void;
    reject: (err: any) => void;
};

type LocalStream = { id: number, stream: ReadableStream<Uint8Array> };

export interface RPCPeerOptions {
    dataChannel: GenericDataChannel;
    handlers: ProxyHandlers;
    fingerprint: string | null;
    isSecure: boolean;
    id?: string;
    pingIntervalMs?: number; // Optional ping interval in milliseconds
    onError?: (error: Error) => void;
    onClose?: (rpc: RPCPeer) => void;
    onReady?: (rpc: RPCPeer) => void;
}

// ----- RPCPeer Implementation -----
export class RPCPeer {
    private parser: DataChannelParser;
    private nextCallId = 1;
    private nextStreamId = 1;

    private pending = new Map<number, PendingCall>();
    private streamControllers = new Map<number, ReadableStreamController<Uint8Array>>();
    private outgoingStreamReaders = new Map<number, ReadableStreamDefaultReader<Uint8Array>>();
    private cancelledStreams = new Set<number>(); // streams we've already sent CANCEL for
    private streamRecvStats = new Map<number, { bytes: number; start: number }>();
    private targetPublicKeyPem: string | null = null;
    private targetFingerprint: string | null = null;
    private targetDeviceName: string | null = null;

    private isTargetAuthenticated = false;
    private isTargetReady = false;
    /** Stateful AES-256-CTR cipher for encrypting all outbound frames (set after auth). */
    private sendCipher: { update(data: Uint8Array): Uint8Array } | null = null;
    /** Stateful AES-256-CTR decipher for decrypting all inbound frames (set after auth). */
    private recvDecipher: { update(data: Uint8Array): Uint8Array } | null = null;

    private pingIntervalId: number | null = null;
    private lastPingReceived: number = Date.now();
    private pingTimeoutMs: number;

    private isStandby: boolean = false;
    private isRemoteStandby: boolean = false;
    private isClosed: boolean = false;
    private tag: string;

    constructor(private opts: RPCPeerOptions) {
        this.tag = opts.id || fp(opts.fingerprint || 'unknown');
        this.parser = new DataChannelParser({ onFrame: this.onFrame });
        // this.opts.dataChannel.binaryType = 'arraybuffer';
        this.opts.dataChannel.onmessage = data => {
            this.parser.feed(data);
        };
        this.opts.dataChannel.onerror = (ev: Error | string) => {
            this.onError(typeof ev === 'string' ? new Error(ev) : ev);
        };
        this.opts.dataChannel.ondisconnect = () => {
            console.log(`[RPC:${this.tag}] Data channel disconnected`);
            this.close(true);
        };
        this.sendHello();
        this.startPing();
    }

    setStandby(isStandby: boolean) {
        this.isStandby = isStandby;
    }

    private startPing() {
        if (this.pingIntervalId || !this.opts.pingIntervalMs) return;
        // Ensure ping interval is min 1 second
        if (this.opts.pingIntervalMs < 1000) {
            console.warn(`[RPC] Ping interval is too short, setting to 1000ms`);
            this.opts.pingIntervalMs = 1000;
        }
        // Set timeout to 3x the ping interval
        this.pingTimeoutMs = this.opts.pingIntervalMs * 3;
        this.lastPingReceived = Date.now();
        this.pingIntervalId = setInterval(() => {
            if (this.isReady()) {
                this.sendPing();
                // Check if we've received a ping recently
                const timeSinceLastPing = Date.now() - this.lastPingReceived;
                if (timeSinceLastPing > this.pingTimeoutMs) {
                    console.warn(`[RPC:${this.tag}] No ping received for ${timeSinceLastPing}ms, closing connection`);
                    this.onError(new Error('Ping timeout: no ping received from peer'));
                }
            }
        }, this.opts.pingIntervalMs);
    }

    private stopPing() {
        if (this.pingIntervalId) {
            clearInterval(this.pingIntervalId);
            this.pingIntervalId = null;
        }
    }

    public getTargetDeviceName() {
        return this.targetDeviceName;
    }

    public getTargetFingerprint() {
        return this.targetFingerprint || this.opts.fingerprint;
    }

    public isReady() {
        return this.isTargetReady && this.isTargetAuthenticated;
    }

    private static readonly UNDEF_TOKEN = '__rpc_undef__';

    private stringify(obj: any) {
        const streams: LocalStream[] = [];

        const encoded = JSON.stringify(obj, (_, v) => {
            if (v === undefined) {
                return RPCPeer.UNDEF_TOKEN;
            }
            if (v instanceof ReadableStream) {
                const id = this.nextStreamId++;
                streams.push({ id, stream: v });
                return { __rpc_stream_id__: id };
            }
            return v;
        });

        return { encoded, streams };
    }

    public async call(method: string, params: any[]): Promise<any> {
        const callId = this.nextCallId++;

        const { encoded, streams } = this.stringify(params);

        if (streams.length > 0) {
            console.debug('Sending streams', streams.map(s => s.id), 'for call', method);
        }

        const request = {
            callId,
            method,
            params: encoded,
        };

        const payload = new TextEncoder().encode(JSON.stringify(request));
        await this.sendFrame(MessageType.REQUEST, payload);

        for (const { id, stream } of streams) {
            await this.sendStream(id, stream);
        }

        let resolve!: (v: any) => void;
        let reject!: (e: any) => void;

        const promise = new Promise<any>((res, rej) => {
            resolve = res;
            reject = rej;
        });

        this.pending.set(callId, {
            resolve,
            reject,
        });
        return promise;
    }

    public async subscribeSignal(fqn: string) {
        const payload = new TextEncoder().encode(JSON.stringify({ fqn }));
        await this.sendFrame(MessageType.SIGNAL_SUBSCRIBE, payload);
    }

    public async unsubscribeSignal(fqn: string) {
        const payload = new TextEncoder().encode(JSON.stringify({ fqn }));
        await this.sendFrame(MessageType.SIGNAL_UNSUBSCRIBE, payload);
    }

    public async sendSignal(fqn: string, data: any[]) {
        const payload = new TextEncoder().encode(JSON.stringify({ fqn, data }));
        await this.sendFrame(MessageType.SIGNAL_EVENT, payload);
    }

    private onError(error: Error) {
            console.error(`[RPC:${this.tag}] Error:`, error);
        this.opts.onError?.(error);
        this.close();
    }

    public close(isDisconnected = false) {
        if (this.isClosed) return;
        this.isClosed = true;
        console.log(`[RPC:${this.tag}] Closing RPCPeer`);
        // Cancel all outgoing stream pumps first, before disconnecting
        // the data channel, so in-flight sends don't hit a closed socket.
        this.outgoingStreamReaders.forEach(reader => reader.cancel().catch(() => { }));
        this.outgoingStreamReaders.clear();
        // Error (not close) incoming streams so consumers know data is incomplete.
        // ctrl.close() would signal normal end-of-stream, causing truncated files.
        const streamError = new Error('Connection closed');
        this.streamControllers.forEach(ctrl => {
            try { ctrl.error(streamError); } catch { /* already closed */ }
        });
        this.streamControllers.clear();
        this.cancelledStreams.clear();
        // Reject all pending RPC calls so callers don't hang forever.
        const pendingError = new Error('Connection closed');
        this.pending.forEach(({ reject }) => reject(pendingError));
        this.pending.clear();
        this.stopPing();
        if (!isDisconnected) {
            this.opts.dataChannel.disconnect();
        }
        this.opts.onClose?.(this);
    }

    private onFrame = async ({ type, flags, payload }: { type: number, payload: Uint8Array, flags: number }) => {
        // Any received frame proves the peer is alive
        this.lastPingReceived = Date.now();

        if (!this.targetPublicKeyPem && type !== MessageType.HELLO) {
            console.warn(`[RPC:${this.tag}] Received message before HELLO`, type);
            return;
        }
        if (!this.isReady() && !SETUP_AUTH_TYPES.includes(type)) {
            console.warn(`[RPC:${this.tag}] Message type not allowed right now`, type);
            return;
        }
        // Decrypt payload for non-setup messages using the connection-level decipher.
        if (this.recvDecipher && !SETUP_AUTH_TYPES.includes(type)) {
            payload = this.recvDecipher.update(payload);
        }
        try {
            switch (type) {
                case MessageType.PING:
                    this.handlePing(payload);
                    break;
                case MessageType.HELLO:
                    console.debug(`[RPC:${this.tag}] Received HELLO message`);
                    this.handleHello(payload);
                    break;
                case MessageType.READY:
                    console.debug(`[RPC:${this.tag}] Received READY message`);
                    this.handleTargetReady(payload);
                    break;
                case MessageType.REQUEST:
                    await this.handleRequest(payload);
                    break;
                case MessageType.RESPONSE:
                    this.handleResponse(payload);
                    break;
                case MessageType.ERROR:
                    this.handleError(payload);
                    break;
                case MessageType.AUTH_CHALLENGE:
                    console.debug(`[RPC:${this.tag}] Received AUTH_CHALLENGE message`);
                    await this.onAuthChallenge(payload);
                    break;
                case MessageType.AUTH_RESPONSE:
                    console.debug(`[RPC:${this.tag}] Received AUTH_RESPONSE message`);
                    await this.onAuthResponse(payload);
                    break;
                case MessageType.STREAM_CANCEL:
                case MessageType.STREAM_CHUNK:
                case MessageType.STREAM_END:
                    this.handleStreamMessage(type, payload);
                    break;
                case MessageType.SIGNAL_EVENT:
                    this.handleSignalEvent(payload);
                    break;
                case MessageType.SIGNAL_SUBSCRIBE:
                    this.handleSignalSubscribe(payload);
                    break;
                case MessageType.SIGNAL_UNSUBSCRIBE:
                    this.handleSignalUnsubscribe(payload);
                    break;
                default:
                    console.warn(`[RPC:${this.tag}] Unknown message type received`, type);
            }
        } catch (e) {
            console.error(`[RPC:${this.tag}] Error handling frame`, type, e);
            // Ignore errors in handling frames, we don't want to crash the connection for now.
        }
    }

    private handleSignalEvent(buf: Uint8Array) {
        const json = new TextDecoder().decode(buf);
        const { fqn, data } = JSON.parse(json);
        if (!Array.isArray(data)) {
            console.error(`[RPC:${this.tag}] Invalid signal data format, expected an array`);
            return;
        }
        this.opts.handlers.signalEvent(fqn, data);
    }

    private handleSignalSubscribe(buf: Uint8Array) {
        const json = new TextDecoder().decode(buf);
        const { fqn } = JSON.parse(json);
        this.opts.handlers.signalSubscribe(fqn);
    }

    private handleSignalUnsubscribe(buf: Uint8Array) {
        const json = new TextDecoder().decode(buf);
        const { fqn } = JSON.parse(json);
        this.opts.handlers.signalUnsubscribe(fqn);
    }

    private otp: string | null = null;

    private async sendAuthChallenge() {
        if (!this.targetPublicKeyPem) {
            console.error(`[RPC:${this.tag}] Target public key is not set`);
            return;
        }
        console.debug(`[RPC:${this.tag}] Sending AUTH_CHALLENGE message`);
        this.otp = modules.crypto.generateRandomKey();
        let securityKey: string | null = null;
        let iv: string | null = null;
        if (!this.opts.isSecure) {
            securityKey = modules.crypto.generateRandomKey();
            iv = modules.crypto.generateIv();
            this.recvDecipher = modules.crypto.createDecipher(securityKey, iv);
        }

        const challenge = {
            otp: this.otp,
            securityKey,
            iv,
        };
        const payload = await modules.crypto.encryptPK(JSON.stringify(challenge), this.targetPublicKeyPem);
        await this.sendFrame(MessageType.AUTH_CHALLENGE, payload);
    }

    private async onAuthResponse(buf: Uint8Array) {
        if (this.isTargetAuthenticated) {
            console.warn(`[RPC:${this.tag}] Already authenticated, ignoring AUTH_RESPONSE`);
            return;
        }
        if (!this.otp) {
            console.error(`[RPC:${this.tag}] No OTP set, cannot authenticate`);
            return;
        }
        const payload = await modules.crypto.decryptPK(buf, modules.config.PRIVATE_KEY_PEM);
        const json = new TextDecoder().decode(payload);
        const { otp } = JSON.parse(json);
        if (this.otp !== otp) {
            console.error(`[RPC:${this.tag}] Invalid OTP received`);
            this.onError(new Error('Invalid OTP received'));
            return;
        }
        this.otp = null;
        this.isTargetAuthenticated = true;
        await this.sendFrame(MessageType.READY, new Uint8Array(0));
        if (this.isReady()) {
            this.opts.onReady?.(this);
        }
    }

    private async onAuthChallenge(buf: Uint8Array) {
        if (this.isTargetReady) {
            console.warn(`[RPC:${this.tag}] Already authenticated, ignoring AUTH_CHALLENGE`);
            return;
        }
        const payload = await modules.crypto.decryptPK(buf, modules.config.PRIVATE_KEY_PEM);
        const json = new TextDecoder().decode(payload);
        const { otp, securityKey, iv } = JSON.parse(json);
        if (!this.opts.isSecure && (!securityKey || !iv)) {
            console.error(`[RPC:${this.tag}] Security key and IV are required`);
            this.onError(new Error('Security key and IV are required for non-secure connections but not provided by target'));
            return;
        }
        if (securityKey && iv) {
            this.sendCipher = modules.crypto.createCipher(securityKey, iv);
        }
        const response = { otp };
        const responsePayload = await modules.crypto.encryptPK(JSON.stringify(response), this.targetPublicKeyPem);
        await this.sendFrame(MessageType.AUTH_RESPONSE, responsePayload);
    }

    private handleTargetReady(buf: Uint8Array) {
        if (this.isTargetReady) {
            console.warn(`[RPC:${this.tag}] Already ready, ignoring READY`);
            return;
        }
        this.isTargetReady = true;
        if (this.isReady()) {
            this.opts.onReady?.(this);
        }
    }

    private parseJson(text: string) {
        try {
            return JSON.parse(text, (_, v) => {
                if (v === RPCPeer.UNDEF_TOKEN) {
                    return undefined;
                }
                if (!!v && v.__rpc_stream_id__ && typeof v.__rpc_stream_id__ === 'number') {
                    const id = v.__rpc_stream_id__;
                    const stream = new ReadableStream<Uint8Array>({
                        start: ctrl => {
                            console.debug(`[RPC:${this.tag}] Registering stream controller for id=${id}`);
                            this.streamControllers.set(id, ctrl);
                        },
                        cancel: () => {
                            console.log(`[RPC:${this.tag}] Stream ${id} cancelled by consumer`);
                            this.cancelStream(id);
                            this.streamControllers.delete(id);
                        }
                    });

                    return stream;
                }
                return v;
            });
        } catch (e) {
            console.error(`[RPC:${this.tag}] Failed to parse JSON`, e);
            console.debug('JSON text:', text?.slice(0, 200));
            return null;
        }
    }

    private async handleRequest(buf: Uint8Array) {
        const json = new TextDecoder().decode(buf);
        const { callId, method, params } = JSON.parse(json);

        let decodedParams: any[] = [];

        try {
            decodedParams = this.parseJson(params);
            if (!Array.isArray(decodedParams)) {
                throw new Error('Invalid parameters format, expected an array');
            }
        } catch (e) {
            console.error(`[RPC:${this.tag}] Failed to decode parameters`, e);
            await this.sendError(callId, 'Failed to decode parameters');
            return;
        }

        try {
            const result = await this.opts.handlers.methodCall(method, decodedParams);
            const { encoded, streams } = this.stringify(result);
            const response = { callId, result: encoded };
            const payload = new TextEncoder().encode(JSON.stringify(response));
            await this.sendFrame(MessageType.RESPONSE, payload);

            for (const { id, stream } of streams) {
                try {
                    await this.sendStream(id, stream);
                } catch (streamErr) {
                    console.error(`[RPC:${this.tag}] Error sending stream ${id} for '${method}':`, streamErr);
                    // Notify receiver so it doesn't hang waiting for data
                    this.cancelStream(id).catch(() => { });
                }
            }
        } catch (e) {
            console.error(`[RPC:${this.tag}] Error handling RPC request '${method}':`, e);
            try {
                await this.sendError(callId, e.message || 'Unknown error');
            } catch (sendErr) {
                // If we can't send the error (e.g., socket closed), just log it
                if (!this.isClosed) {
                    console.error(`[RPC:${this.tag}] Failed to send error response:`, sendErr);
                }
            }
        }
    }

    private handleResponse(buf: Uint8Array) {
        const json = new TextDecoder().decode(buf);
        let callId: number;
        let result: any;
        try {
            ({ callId, result } = JSON.parse(json));
        } catch (e) {
            console.error(`[RPC:${this.tag}] Failed to parse response JSON`, e);
            console.debug('Response buffer (truncated):', json?.slice(0, 200));
            return;
        }
        const entry = this.pending.get(callId);
        if (!entry) {
            console.debug(`[RPC:${this.tag}] Received response for unknown call`, callId);
            return;
        }

        const decoded = result !== undefined ? this.parseJson(result) : undefined;
        // console.debug(`[RPC:${this.tag}] handleResponse callId=${callId}, registered streams:`, [...this.streamControllers.keys()]);

        entry.resolve(decoded);
        this.pending.delete(callId);
    }

    private handleHello(buf: Uint8Array) {
        if (this.targetPublicKeyPem) {
            console.warn(`[RPC:${this.tag}] Received multiple HELLO messages`);
            return;
        }
        const json = new TextDecoder().decode(buf);
        const { version, publicKeyPem, deviceName } = JSON.parse(json);
        // console.debug('Received HELLO from target', json);
        const computedFingerprint = modules.crypto.getFingerprintFromPem(publicKeyPem);
        if (this.opts.fingerprint && computedFingerprint !== this.opts.fingerprint) {
            console.error(`[RPC:${this.tag}] Fingerprint mismatch`);
            // disconnect and cleanup
            this.onError(new Error('Fingerprint mismatch'));
        } else {
            this.targetPublicKeyPem = publicKeyPem;
            this.targetFingerprint = computedFingerprint;
            this.targetDeviceName = deviceName || null;
            this.sendAuthChallenge();
        }
    }

    private async sendHello() {
        console.debug(`[RPC:${this.tag}] Sending HELLO message`);
        const hello = {
            version: '1.0',
            deviceName: modules.config.DEVICE_NAME,
            publicKeyPem: modules.config.PUBLIC_KEY_PEM,
        };
        const payload = new TextEncoder().encode(JSON.stringify(hello));
        await this.sendFrame(MessageType.HELLO, payload);
    }

    private handlePing(buf: Uint8Array) {
        this.lastPingReceived = Date.now();
        if (buf.length > 0) {
            this.isRemoteStandby = buf[0] === 1;
            // If both sides are on standby, close the connection —
            // but only if no streams are actively in progress.
            if (this.isStandby && this.isRemoteStandby
                && this.streamControllers.size === 0
                && this.outgoingStreamReaders.size === 0) {
                console.log(`[RPC:${this.tag}] Both sides are on standby, closing connection`);
                this.close();
            }
        }
    }

    public async sendPing() {
        const pingPayload = new Uint8Array([this.isStandby ? 1 : 2]);
        await this.sendFrame(MessageType.PING, pingPayload);
    }

    private handleError(buf: Uint8Array) {
        const json = new TextDecoder().decode(buf);
        const { callId, error } = JSON.parse(json);
        const entry = this.pending.get(callId);
        if (!entry) return;

        entry.reject(error);
        this.pending.delete(callId);
    }

    private handleStreamMessage(type: number, buf: Uint8Array) {
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        const streamId = dv.getUint32(0, false);

        // Handle STREAM_CANCEL from remote — stop our outgoing pump
        if (type === MessageType.STREAM_CANCEL) {
            const reader = this.outgoingStreamReaders.get(streamId);
            if (reader) {
                console.log(`[RPC:${this.tag}] Remote cancelled outgoing stream ${streamId}`);
                reader.cancel().catch(() => { });
                this.outgoingStreamReaders.delete(streamId);
            }
            // Also clean up any incoming controller for this stream
            const ctrl = this.streamControllers.get(streamId);
            if (ctrl) {
                ctrl.close();
                this.streamControllers.delete(streamId);
            }
            return;
        }

        const chunk = buf.slice(4);
        let ctrl = this.streamControllers.get(streamId);

        if (!ctrl) {
            // Send CANCEL back once so the sender stops
            if (!this.cancelledStreams.has(streamId)) {
                this.cancelledStreams.add(streamId);
                console.debug(`[RPC:${this.tag}] Unknown stream ${streamId}, sending CANCEL`);
                this.cancelStream(streamId).catch(() => { });
            }
            return;
        }

        if (type === MessageType.STREAM_CHUNK) {
            if (isDebug()) {
                let stats = this.streamRecvStats.get(streamId);
                if (!stats) {
                    stats = { bytes: 0, start: Date.now() };
                    this.streamRecvStats.set(streamId, stats);
                }
                stats.bytes += chunk.byteLength;
            }
            ctrl.enqueue(chunk);
        } else if (type === MessageType.STREAM_END) {
            if (isDebug()) {
                const stats = this.streamRecvStats.get(streamId);
                if (stats && stats.bytes > 1024) {
                    const elapsed = (Date.now() - stats.start) / 1000;
                    const sizeMB = (stats.bytes / (1024 * 1024)).toFixed(2);
                    const speedKBs = (stats.bytes / 1024 / elapsed).toFixed(1);
                    console.debug(`[RPC:${this.tag}] Received ${sizeMB} MB in ${elapsed.toFixed(1)}s (${speedKBs} KB/s) stream=${streamId}`);
                } else {
                    console.debug(`[RPC:${this.tag}] Received STREAM_END for stream=${streamId} (${stats?.bytes ?? 0} bytes)`);
                }
                this.streamRecvStats.delete(streamId);
            }
            ctrl.close();
            this.streamControllers.delete(streamId);
        }
    }

    private async sendError(callId: number, error: string) {
        const payload = new TextEncoder().encode(JSON.stringify({ callId, error }));
        await this.sendFrame(MessageType.ERROR, payload);
    }

    private async sendStream(streamId: number, source: ReadableStream<Uint8Array>) {
        const reader = source.getReader();
        this.outgoingStreamReaders.set(streamId, reader);

        const pump = async () => {
            console.debug(`[RPC:${this.tag}] Stream pump started for stream=${streamId}`);
            let lastYield = Date.now();
            let totalBytes = 0;
            const startTime = Date.now();
            // Pipeline timing: track where time is spent
            let totalReadMs = 0;
            let totalSendMs = 0;
            let chunkCount = 0;
            let lastLogTime = Date.now();
            try {
                // Pipeline: kick off the first read before entering the loop
                console.debug(`[RPC:${this.tag}] stream=${streamId} initiating first read`);
                let nextRead = reader.read();

                while (true) {
                    if (this.isClosed) {
                        console.debug(`[RPC:${this.tag}] stream=${streamId} connection closed during pump, cancelling`);
                        reader.cancel();
                        return;
                    }
                    const t0 = Date.now();
                    const { done, value } = await nextRead;
                    const t1 = Date.now();
                    if (done) {
                        console.debug(`[RPC:${this.tag}] stream=${streamId} source stream ended after ${chunkCount} chunks`);
                        break;
                    }
                    if (isDebug()) totalBytes += value.byteLength;
                    chunkCount++;

                    // Start the next read immediately — overlaps I/O with send
                    nextRead = reader.read();

                    // [streamId (4B) | data]
                    const payload = new Uint8Array(4 + value.byteLength);
                    new DataView(payload.buffer).setUint32(0, streamId, false);
                    payload.set(value, 4);

                    await this.sendFrame(MessageType.STREAM_CHUNK, payload);
                    const t2 = Date.now();

                    totalReadMs += (t1 - t0);
                    totalSendMs += (t2 - t1);

                    // Periodically yield to let the event loop process
                    // incoming pings, timers, and other I/O.
                    const now = Date.now();
                    if (now - lastYield >= 1000) {
                        lastYield = now;
                        await new Promise<void>(resolve => setTimeout(resolve, 0));
                    }

                    // Log pipeline timing every 5 seconds
                    if (isDebug() && now - lastLogTime >= 5000) {
                        const dtSec = (now - lastLogTime) / 1000;
                        const throughput = ((totalBytes / 1024) / ((now - startTime) / 1000)).toFixed(1);
                        console.log(`[RPC:${this.tag}] stream=${streamId} | ${chunkCount} chunks, ${throughput} KB/s avg | readWait: ${totalReadMs}ms sendWait: ${totalSendMs}ms (last ${dtSec.toFixed(1)}s)`);
                        totalReadMs = 0;
                        totalSendMs = 0;
                        lastLogTime = now;
                    }
                }

                const elapsed = (Date.now() - startTime) / 1000;
                if (isDebug() && totalBytes > 1024) {
                    const sizeMB = (totalBytes / (1024 * 1024)).toFixed(2);
                    const speedKBs = (totalBytes / 1024 / elapsed).toFixed(1);
                    console.log(`[RPC:${this.tag}] Sent ${sizeMB} MB in ${elapsed.toFixed(1)}s (${speedKBs} KB/s) stream=${streamId} | total readWait: ${totalReadMs}ms sendWait: ${totalSendMs}ms`);
                }

                if (!this.isClosed) {
                    console.debug(`[RPC:${this.tag}] Sending STREAM_END for stream=${streamId} (${chunkCount} chunks, ${totalBytes} bytes)`);
                    const end = new Uint8Array(4);
                    new DataView(end.buffer).setUint32(0, streamId, false);
                    await this.sendFrame(MessageType.STREAM_END, end);
                    console.debug(`[RPC:${this.tag}] STREAM_END sent for stream=${streamId}`);
                } else {
                    console.debug(`[RPC:${this.tag}] Skipping STREAM_END for stream=${streamId} — connection closed`);
                }
            } catch (e) {
                if (!this.isClosed) {
                    console.error(`[RPC:${this.tag}] Error in stream pump for stream=${streamId} after ${chunkCount} chunks, ${totalBytes} bytes:`, e);
                } else {
                    console.debug(`[RPC:${this.tag}] Stream pump for stream=${streamId} ended (connection closed) after ${chunkCount} chunks`);
                }
                reader.cancel().catch(() => { });
            } finally {
                console.debug(`[RPC:${this.tag}] Stream pump cleanup for stream=${streamId}`);
                this.outgoingStreamReaders.delete(streamId);
            }
        };

        pump().catch(() => { });
    }

    private async cancelStream(streamId: number) {
        const buf = new Uint8Array(4);
        new DataView(buf.buffer).setUint32(0, streamId, false);
        await this.sendFrame(MessageType.STREAM_CANCEL, buf);
    }

    private async sendFrame(type: MessageType, payload: Uint8Array) {
        if (this.isClosed) {
            console.warn(`[RPC:${this.tag}] Attempted to send frame on closed connection`);
            return; // Silently ignore sends on closed connection
        }
        // Encrypt payload for non-setup messages using the connection-level cipher.
        if (this.sendCipher && !SETUP_AUTH_TYPES.includes(type)) {
            payload = this.sendCipher.update(payload);
        }
        const framed = DataChannelParser.encode(type, 0x00, payload);
        try {
            await this.opts.dataChannel.send(framed);
            // A successful send proves the data channel is alive.
            // The underlying transport (ReUDP/TCP) handles dead-peer detection.
            this.lastPingReceived = Date.now();
        } catch (e) {
            if (!this.isClosed) {
                console.error(`[RPC:${this.tag}] Error sending frame:`, e);
                throw e;
            }
            // If closed, silently ignore the error
        }
    }
}
