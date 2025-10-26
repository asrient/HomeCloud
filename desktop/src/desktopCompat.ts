import { HttpClientCompat, DatagramCompat, WsClientCompat } from "shared/compat";
import dgram from "dgram";

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
                this.onMessage(new Uint8Array(msg), {
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
            this.socket.send(Buffer.from(data), port, address);
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