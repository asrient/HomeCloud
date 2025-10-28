import { DataChannelParser } from './DataChannelParser';
import { ProxyHandlers, GenericDataChannel } from './types';

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
    pingIntervalMs?: number; // Optional ping interval in milliseconds
    onError?: (error: Error) => void;
    onClose?: () => void;
    onReady?: (rpc: RPCPeer) => void;
}

// ----- RPCPeer Implementation -----
export class RPCPeer {
    private parser: DataChannelParser;
    private nextCallId = 1;
    private nextStreamId = 1;

    private pending = new Map<number, PendingCall>();
    private streamControllers = new Map<number, ReadableStreamController<Uint8Array>>();
    private targetPublicKeyPem: string | null = null;
    private targetFingerprint: string | null = null;
    private targetDeviceName: string | null = null;

    private isTargetAuthenticated = false;
    private isTargetReady = false;
    // todo: utlize these keys:
    private encryptionKey: string | null = null;
    private decryptionKey: string | null = null;

    private pingIntervalId: number | null = null;

    constructor(private opts: RPCPeerOptions) {
        this.parser = new DataChannelParser({ onFrame: this.onFrame });
        // this.opts.dataChannel.binaryType = 'arraybuffer';
        this.opts.dataChannel.onmessage = data => {
            this.parser.feed(data);
        };
        this.opts.dataChannel.onerror = (ev: Error | string) => {
            this.onError(typeof ev === 'string' ? new Error(ev) : ev);
        };
        this.opts.dataChannel.ondisconnect = () => {
            console.log('Data channel disconnected');
            this.close(true);
        };
        this.sendHello();
        this.startPing();
    }

    private startPing() {
        if (this.pingIntervalId || !this.opts.pingIntervalMs) return;
        // Ensure ping interval is min 1 second
        if (this.opts.pingIntervalMs < 1000) {
            console.warn('Ping interval is too short, setting to 1000ms');
            this.opts.pingIntervalMs = 1000;
        }
        this.pingIntervalId = setInterval(() => {
            if (this.isReady()) {
                this.sendPing();
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

    private stringify(obj: any) {
        const streams: LocalStream[] = [];

        const encoded = JSON.stringify(obj, (_, v) => {
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
        console.error('RPCPeer error:', error);
        this.opts.onError?.(error);
        this.close();
    }

    public close(isDisconnected = false) {
        console.log('Closing RPCPeer connection');
        if (!isDisconnected) {
            this.opts.dataChannel.disconnect();
        }
        this.pending.clear();
        this.streamControllers.forEach(ctrl => ctrl.close());
        this.streamControllers.clear();
        this.stopPing();
        this.opts.onClose?.();
    }

    private onFrame = async ({ type, flags, payload }: { type: number, payload: Uint8Array, flags: number }) => {
        if (!this.targetPublicKeyPem && type !== MessageType.HELLO) {
            console.warn('Received message before HELLO', type, new TextDecoder().decode(payload));
            return;
        }
        if (!this.isReady() && !SETUP_AUTH_TYPES.includes(type)) {
            console.warn('Message type not allowed right now', type);
            return;
        }
        try {
            switch (type) {
                case MessageType.PING:
                    // Handle ping if needed, currently no-op
                    break;
                case MessageType.HELLO:
                    this.handleHello(payload);
                    break;
                case MessageType.READY:
                    this.handleTargetReady(payload);
                    break;
                case MessageType.REQUEST:
                    this.handleRequest(payload);
                    break;
                case MessageType.RESPONSE:
                    this.handleResponse(payload);
                    break;
                case MessageType.ERROR:
                    this.handleError(payload);
                    break;
                case MessageType.AUTH_CHALLENGE:
                    await this.onAuthChallenge(payload);
                    break;
                case MessageType.AUTH_RESPONSE:
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
                    console.warn('Unknown message type received', type);
            }
        } catch (e) {
            console.error('Error handling frame', type, e);
            // Ignore errors in handling frames, we don't want to crash the connection for now.
        }
    }

    private handleSignalEvent(buf: Uint8Array) {
        const json = new TextDecoder().decode(buf);
        const { fqn, data } = JSON.parse(json);
        if (!Array.isArray(data)) {
            console.error('Invalid signal data format, expected an array');
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
            console.error('Target public key is not set');
            return;
        }
        this.otp = modules.crypto.generateRandomKey();
        if (!this.opts.isSecure) {
            this.decryptionKey = modules.crypto.generateRandomKey();
        }

        const challenge = {
            otp: this.otp,
            securityKey: this.opts.isSecure ? null : this.decryptionKey,
        };
        const payload = await modules.crypto.encryptPK(JSON.stringify(challenge), this.targetPublicKeyPem);
        await this.sendFrame(MessageType.AUTH_CHALLENGE, payload);
    }

    private async onAuthResponse(buf: Uint8Array) {
        if (this.isTargetAuthenticated) {
            console.warn('Already authenticated, ignoring AUTH_RESPONSE');
            return;
        }
        if (!this.otp) {
            console.error('No OTP set, cannot authenticate');
            return;
        }
        const payload = await modules.crypto.decryptPK(buf, modules.config.PRIVATE_KEY_PEM);
        const json = new TextDecoder().decode(payload);
        const { otp } = JSON.parse(json);
        if (this.otp !== otp) {
            console.error('Invalid OTP received', otp, this.otp);
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
            console.warn('Already authenticated, ignoring AUTH_CHALLENGE');
            return;
        }
        const payload = await modules.crypto.decryptPK(buf, modules.config.PRIVATE_KEY_PEM);
        const json = new TextDecoder().decode(payload);
        const { otp, securityKey } = JSON.parse(json);
        if (!this.opts.isSecure && !securityKey) {
            console.error('Security key is required for non-secure connections');
            this.onError(new Error('Security key is required for non-secure connections but not provided by target'));
            return;
        }
        this.encryptionKey = securityKey;
        const response = { otp };
        const responsePayload = await modules.crypto.encryptPK(JSON.stringify(response), this.targetPublicKeyPem);
        await this.sendFrame(MessageType.AUTH_RESPONSE, responsePayload);
    }

    private handleTargetReady(buf: Uint8Array) {
        if (this.isTargetReady) {
            console.warn('Already ready, ignoring READY');
            return;
        }
        this.isTargetReady = true;
        if (this.isReady()) {
            this.opts.onReady?.(this);
        }
    }

    private parseJson(text: string) {
        return JSON.parse(text, (_, v) => {
            if (!!v && v.__rpc_stream_id__ && typeof v.__rpc_stream_id__ === 'number') {
                const id = v.__rpc_stream_id__;
                const stream = new ReadableStream<Uint8Array>({
                    start: ctrl => {
                        this.streamControllers.set(id, ctrl);
                    },
                    cancel: () => {
                        this.cancelStream(id);
                        this.streamControllers.delete(id);
                    }
                });

                return stream;
            }
            return v;
        });
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
            console.error('Failed to decode parameters from incoming request', e);
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
                await this.sendStream(id, stream);
            }
        } catch (e) {
            console.error('Error handling request', e);
            await this.sendError(callId, e.message || 'Unknown error');
        }
    }

    private handleResponse(buf: Uint8Array) {
        const json = new TextDecoder().decode(buf);
        const { callId, result } = JSON.parse(json);
        const entry = this.pending.get(callId);
        if (!entry) {
            console.debug('Received response for unknown call', callId, result);
            return;
        }

        const decoded = this.parseJson(result);

        entry.resolve(decoded);
        this.pending.delete(callId);
    }

    private handleHello(buf: Uint8Array) {
        if (this.targetPublicKeyPem) {
            console.warn('Received multiple HELLO messages');
            return;
        }
        const json = new TextDecoder().decode(buf);
        const { version, publicKeyPem, deviceName } = JSON.parse(json);
        // console.debug('Received HELLO from target', json);
        const computedFingerprint = modules.crypto.getFingerprintFromPem(publicKeyPem);
        if (this.opts.fingerprint && computedFingerprint !== this.opts.fingerprint) {
            console.error('Fingerprint mismatch', computedFingerprint, this.opts.fingerprint);
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
        const hello = {
            version: '1.0',
            deviceName: modules.config.DEVICE_NAME,
            publicKeyPem: modules.config.PUBLIC_KEY_PEM,
        };
        const payload = new TextEncoder().encode(JSON.stringify(hello));
        await this.sendFrame(MessageType.HELLO, payload);
    }

    public async sendPing() {
        const pingPayload = new Uint8Array(0);
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
        const dv = new DataView(buf.buffer);
        const streamId = dv.getUint32(0, false);
        const chunk = buf.slice(4);

        let ctrl = this.streamControllers.get(streamId);

        if (!ctrl) {
            console.debug('Received stream message for unknown stream', streamId, type);
            return;
        }

        if (type === MessageType.STREAM_CHUNK) {
            ctrl.enqueue(chunk);
        } else if (type === MessageType.STREAM_END) {
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

        const pump = async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const payload = new Uint8Array(4 + value.byteLength);
                new DataView(payload.buffer).setUint32(0, streamId, false);
                payload.set(value, 4);
                await this.sendFrame(MessageType.STREAM_CHUNK, payload);
            }

            const end = new Uint8Array(4);
            new DataView(end.buffer).setUint32(0, streamId, false);
            await this.sendFrame(MessageType.STREAM_END, end);
        };

        pump();
    }

    private async cancelStream(streamId: number) {
        const buf = new Uint8Array(4);
        new DataView(buf.buffer).setUint32(0, streamId, false);
        await this.sendFrame(MessageType.STREAM_CANCEL, buf);
    }

    private async sendFrame(type: MessageType, payload: Uint8Array) {
        const framed = DataChannelParser.encode(type, 0x00, payload);
        await this.opts.dataChannel.send(framed);
    }
}
