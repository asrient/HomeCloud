import { ConnectionInterface } from "shared/netService";
import { GenericDataChannel, PeerCandidate } from "shared/types";
import Discovery from "./discovery";
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';

const noop = () => { };

/**
 * TCP-based implementation of ConnectionInterface using Bonjour service discovery.
 */
export default class TCPInterface extends ConnectionInterface {
    isSecure = true;
    discovery: Discovery;
    private connections: Map<string, TcpSocket.Socket> = new Map();
    private port: number;

    /**
     * Creates an instance of TCPInterface.
     * @param {number} port - The port number for the TCP server and discovery service.
     */
    constructor(port: number) {
        super();
        this.port = port;
        this.discovery = new Discovery();
    }

    /**
     * Sets the callback for incoming connections.
     * @param {function} callback - Callback function to handle incoming data channels.
     */
    onIncomingConnection(callback: (dataChannel: GenericDataChannel) => void): void {
        // ignoring since we do not start a server on mobile
    }

    /**
     * Connects to a peer candidate and returns a data channel.
     * @param {PeerCandidate} candidate - The peer candidate to connect to.
     * @returns {Promise<GenericDataChannel>} A promise that resolves to a data channel.
     */
    async connect(candidate: PeerCandidate): Promise<GenericDataChannel> {
        return new Promise((resolve, reject) => {
            const socket = new TcpSocket.Socket();
            const host = candidate.data?.host || 'localhost';
            const port = candidate.data?.port || this.port;
            let isResolved = false;

            socket.connect({
                host: host,
                port: port,
            }, () => {
                socket.setKeepAlive(true);
                const connectionId = `${host}:${port}`;
                this.connections.set(connectionId, socket);

                const dataChannel = this.createDataChannel(socket, connectionId);
                resolve(dataChannel);
                isResolved = true;
            });

            socket.on('error', (error) => {
                if (isResolved) return; // Avoid resolving/rejecting multiple times
                console.error('TCP connection error:', error);
                reject(error);
            });

            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Connection timeout'));
            });

            // Set connection timeout
            socket.setTimeout(10000);
        });
    }

    /**
     * Gets available peer candidates using the discovery service.
     * @param {string} [fingerprint] - Optional fingerprint to filter candidates.
     * @returns {Promise<PeerCandidate[]>} A promise that resolves to an array of peer candidates.
     */
    async getCandidates(fingerprint?: string): Promise<PeerCandidate[]> {
        return new Promise((resolve) => {
            // Force discovery update
            this.discovery.getCandidates(false);

            // Wait a bit for discovery to update
            setTimeout(() => {
                const candidates = this.discovery.getCandidates(true);

                if (fingerprint) {
                    const filtered = candidates.filter(candidate => candidate.fingerprint === fingerprint);
                    resolve(filtered);
                } else {
                    resolve(candidates);
                }
            }, 1000);
        });
    }

    /**
     * Starts the TCP server and discovery service.
     * @returns {Promise<void>} A promise that resolves when the service is started.
     */
    async start(): Promise<void> {
    }

    /**
     * Stops the TCP server and discovery service.
     * @returns {Promise<void>} A promise that resolves when the service is stopped.
     */
    async stop(): Promise<void> {
        const promises: Promise<void>[] = [];

        // Close all connections
        for (const [connectionId, socket] of this.connections) {
            socket.destroy();
            this.connections.delete(connectionId);
        }

        // Stop discovery
        promises.push(this.discovery.goodbye());

        await Promise.all(promises);
    }

    /**
     * Creates a GenericDataChannel wrapper for a TCP socket.
     * @private
     * @param {net.Socket} socket - The TCP socket.
     * @param {string} connectionId - The connection identifier.
     * @returns {GenericDataChannel} The data channel wrapper.
     */
    private createDataChannel(socket: TcpSocket.Socket, connectionId: string): GenericDataChannel {
        let messageHandler: ((ev: MessageEvent) => void) = noop;
        let errorHandler: ((ev: ErrorEvent) => void) = noop;
        let disconnectHandler: ((ev: CloseEvent) => void) = noop;

        // Set up data parsing for incoming messages
        socket.on('data', (data) => {
            // Convert data to buffer if its string
            if (typeof data === 'string') {
                data = Buffer.from(data, 'utf8');
            } else if (!(data instanceof Buffer)) {
                console.warn(`Received data of unexpected type: ${typeof data}`);
                return;
            }
            // Create a MessageEvent-like object
            const messageEvent = {
                data: data.slice(data.byteOffset, data.byteOffset + data.byteLength)
            } as MessageEvent;
            messageHandler(messageEvent);

        });

        socket.on('error', (error) => {
            const errorEvent = {
                error: error
            } as ErrorEvent;
            errorHandler(errorEvent);

        });

        socket.on('close', (hadErr) => {
            console.log(`Socket ${connectionId} closed. Had error: ${hadErr}`);
            const closeEvent = {
                code: 1000,
                reason: 'Connection closed'
            } as CloseEvent;
            disconnectHandler(closeEvent);

            if (this.connections.has(connectionId)) {
                this.connections.delete(connectionId);
            }
        });

        return {
            send: (data: ArrayBufferView) => {
                const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
                socket.write(buffer);
            },

            get onmessage() {
                return messageHandler;
            },

            set onmessage(handler: ((ev: MessageEvent) => void)) {
                messageHandler = handler;
            },

            get onerror() {
                return errorHandler;
            },

            set onerror(handler: ((ev: ErrorEvent) => void)) {
                errorHandler = handler;
            },

            get ondisconnect() {
                return disconnectHandler;
            },

            set ondisconnect(handler: ((ev: CloseEvent) => void)) {
                disconnectHandler = handler;
            },

            disconnect: () => {
                console.log(`Disconnecting socket: ${connectionId}`);
                socket.end();
                this.connections.delete(connectionId);
            }
        };
    }
}
