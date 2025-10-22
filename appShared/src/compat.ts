/**
 * Interface representing a UDP datagram socket.
 * Provides methods for creating, sending, receiving data, and closing the socket.
 */
export abstract class DatagramCompat {
    abstract bind(port?: number, address?: string): Promise<void>;
    abstract address(): { address: string; family: string; port: number };

    onListen?: () => void;
    onError?: (err: Error) => void;
    onClose?: () => void;

    abstract send(data: Uint8Array, port: number, address: string): void;
    abstract close(): void;

    onMessage?: (msg: Uint8Array, rinfo: { address: string; family: string; port: number }) => void;
}

export interface HttpClientCompat {
    setDefaultHeader(name: string, value: string): void;
    get(url: string | URL, headers?: Record<string, string>): Promise<Response>;
    post(url: string | URL, body: any, headers?: Record<string, string>): Promise<Response>;
}

export abstract class WsClientCompat {
    abstract onopen?: (event: Event) => void;
    abstract onmessage?: (event: MessageEvent) => void;
    abstract onclose?: (event: CloseEvent) => void;
    abstract onerror?: (event: Event) => void;

    abstract isConnected(): boolean;

    abstract send(data: string | ArrayBuffer | Blob | ArrayBufferView): void;
    abstract close(code?: number, reason?: string): void;

    abstract connect(url: string, protocols?: string | string[]): void;
}
