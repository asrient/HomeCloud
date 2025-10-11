/**
 * Interface representing a UDP datagram socket.
 * Provides methods for creating, sending, receiving data, and closing the socket.
 */
export abstract class DatagramCompat {
    abstract bind(port: number, address?: string): Promise<void>;
    abstract address(): { address: string; family: string; port: number };

    onListen?: () => void;
    onError?: (err: Error) => void;
    onClose?: () => void;

    abstract send(data: Uint8Array, port: number, address: string): void;
    abstract close(): void;

    onMessage?: (msg: Uint8Array, rinfo: { address: string; family: string; port: number }) => void;
}
