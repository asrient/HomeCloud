import { HttpClientCompat, DatagramCompat, WsClientCompat } from "shared/compat";
import dgram from "dgram";
import { importModule } from "./utils";
import { platform } from "os";
import { UserPreferences } from "./types";

export class HttpClient_ implements HttpClientCompat {
    private defaultHeaders: Record<string, string> = {};

    setDefaultHeader(name: string, value: string): void {
        this.defaultHeaders[name] = value;
    }

    async get(url: string | URL, headers?: Record<string, string>): Promise<Response> {
        const mergedHeaders = { ...this.defaultHeaders, ...headers };
        const response = await fetch(url, {
            method: 'GET',
            headers: mergedHeaders,
        });
        return response;
    }

    async post(url: string | URL, body: any, headers?: Record<string, string>): Promise<Response> {
        const mergedHeaders = { ...this.defaultHeaders, ...headers };
        const response = await fetch(url, {
            method: 'POST',
            headers: mergedHeaders,
            body: body,
        });
        return response;
    }
}

export class WebSocket_ extends WsClientCompat {
    private ws?: WebSocket;

    onopen?: (event: Event) => void;
    onmessage?: (event: MessageEvent) => void;
    onclose?: (event: CloseEvent) => void;
    onerror?: (event: Event) => void;

    isConnected(): boolean {
        return this.ws !== undefined && this.ws.readyState === WebSocket.OPEN;
    }

    connect(url: string, protocols?: string | string[]) {
        // Note: Browser WebSocket doesn't support custom headers in constructor
        // Headers would need to be handled differently (e.g., via query params or subprotocols)
        this.ws = new WebSocket(url, protocols);

        this.ws.onopen = (event: Event) => {
            if (this.onopen) {
                this.onopen(event);
            }
        };

        this.ws.onmessage = (event: MessageEvent) => {
            if (this.onmessage) {
                this.onmessage(event);
            }
        };

        this.ws.onclose = (event: CloseEvent) => {
            if (this.onclose) {
                this.onclose(event);
            }
        };

        this.ws.onerror = (event: Event) => {
            if (this.onerror) {
                this.onerror(event);
            }
        };
    }

    send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        }
    }

    close(code?: number, reason?: string): void {
        if (this.ws) {
            this.ws.close(code, reason);
        }
    }
}

export class Datagram_ extends DatagramCompat {
    private socket?: dgram.Socket;
    private _address?: { address: string; family: string; port: number };

    constructor() {
        super();
        this.socket = dgram.createSocket('udp4');

        this.socket.on('listening', () => {
            const addr = this.socket!.address();
            this._address = {
                address: addr.address,
                family: addr.family,
                port: addr.port
            };
            if (this.onListen) {
                this.onListen();
            }
        });

        this.socket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
            if (this.onMessage) {
                this.onMessage(msg, {
                    address: rinfo.address,
                    family: rinfo.family,
                    port: rinfo.port
                });
            }
        });

        this.socket.on('error', (err: Error) => {
            if (this.onError) {
                this.onError(err);
            }
        });

        this.socket.on('close', () => {
            if (this.onClose) {
                this.onClose();
            }
        });
    }

    async bind(port?: number, address?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error('Socket not initialized'));
                return;
            }

            this.socket.once('listening', () => resolve());
            this.socket.once('error', reject);

            if (port !== undefined || address !== undefined) {
                this.socket.bind(port, address);
            } else {
                this.socket.bind();
            }
        });
    }

    address(): { address: string; family: string; port: number } {
        if (this._address) {
            return this._address;
        }
        throw new Error('Socket is not bound');
    }

    async send(data: Uint8Array, port: number, address: string): Promise<void> {
        if (this.socket) {
            this.socket.send(data, port, address);
        }
    }

    close(): void {
        if (this.socket) {
            this.socket.close();
            this.socket = undefined;
            this._address = undefined;
        }
    }
}

// ── WinRT DatagramSocket wrapper ────────────────────────────────────
// Uses Windows.Networking.Sockets.DatagramSocket via native addon.
// This is necessary for MSIX AppContainer where Win32 Winsock (Node.js dgram)
// doesn't fully respect network capabilities like internetClientServer.

interface DatagramWinModule {
    createSocket(callback: (event: string, ...args: any[]) => void): number;
    bind(handle: number, port?: number): { address: string; family: string; port: number };
    send(handle: number, data: Uint8Array | Buffer, port: number, address: string): void;
    address(handle: number): { address: string; family: string; port: number };
    close(handle: number): void;
}

let datagramWinModule: DatagramWinModule | null = null;

function getDatagramWinModule(): DatagramWinModule {
    if (!datagramWinModule) {
        datagramWinModule = importModule("DatagramWin") as DatagramWinModule;
    }
    return datagramWinModule;
}

export class WinRTDatagram extends DatagramCompat {
    private handle: number | null = null;
    private _address?: { address: string; family: string; port: number };

    constructor() {
        super();
        const mod = getDatagramWinModule();
        this.handle = mod.createSocket((event: string, ...args: any[]) => {
            switch (event) {
                case 'message': {
                    const [msg, rinfo] = args;
                    if (this.onMessage) {
                        // msg comes as Buffer from native side
                        this.onMessage(new Uint8Array(msg), rinfo);
                    }
                    break;
                }
                case 'error': {
                    const [errMsg] = args;
                    if (this.onError) {
                        this.onError(new Error(errMsg));
                    }
                    break;
                }
                case 'close': {
                    if (this.onClose) {
                        this.onClose();
                    }
                    break;
                }
            }
        });
    }

    async bind(port?: number, _address?: string): Promise<void> {
        if (this.handle === null) {
            throw new Error('Socket not initialized');
        }
        const mod = getDatagramWinModule();
        const addr = mod.bind(this.handle, port);
        this._address = addr;
        if (this.onListen) {
            this.onListen();
        }
    }

    address(): { address: string; family: string; port: number } {
        if (this._address) {
            return this._address;
        }
        throw new Error('Socket is not bound');
    }

    async send(data: Uint8Array, port: number, address: string): Promise<void> {
        if (this.handle !== null) {
            const mod = getDatagramWinModule();
            mod.send(this.handle, data, port, address);
        }
    }

    close(): void {
        if (this.handle !== null) {
            const mod = getDatagramWinModule();
            try {
                mod.close(this.handle);
            } catch (e) {
                // Already closed
            }
            this.handle = null;
            this._address = undefined;
        }
    }
}

/**
 * Create the best available DatagramCompat for the current environment.
 * - On Windows MSIX (packaged app): uses WinRT DatagramSocket
 * - Otherwise: uses Node.js dgram
 */
export function createBestDatagram(): DatagramCompat {
    if (platform() === 'win32') {
        try {
            const localSc = modules.getLocalServiceController();
            const useWinRT = localSc.app.getUserPreference(UserPreferences.USE_WINRT_DGRAM);
            if (useWinRT) {
                console.log('Using WinRT DatagramSocket.');
                return new WinRTDatagram();
            }
        } catch (e) {
            console.warn('[Datagram] Failed to create WinRT datagram, falling back to Node.js dgram:', e);
        }
    }
    return new Datagram_();
}
