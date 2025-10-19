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
    isSecure = false;
    discovery: Discovery;
    private server: TcpSocket.Server | null = null;
    private connections: Map<string, TcpSocket.Socket> = new Map();
    private port: number;
    private onIncomingConnectionCallback: ((dataChannel: GenericDataChannel) => void) | null = null;

    /**
     * Creates an instance of TCPInterface.
     * @param {number} port - The port number for the TCP server and discovery service.
     */
    constructor(port: number) {
        super();
        this.port = port;
        this.discovery = new Discovery(port);
    }

    /**
     * Sets the callback for incoming connections.
     * @param {function} callback - Callback function to handle incoming data channels.
     */
    onIncomingConnection(callback: (dataChannel: GenericDataChannel) => void): void {
        this.onIncomingConnectionCallback = callback;
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
        return new Promise((resolve, reject) => {
            try {
                // Start the TCP server
                this.server = TcpSocket.createServer({
                    keepAlive: true,
                }, (socket) => {
                    this.handleIncomingConnection(socket);
                });

                this.server.listen({
                    port: this.port,
                    reuseAddress: true,
                }, async () => {
                    console.log(`TCP server listening on port ${this.port}`);

                    // Start discovery service
                    this.discovery.scan();

                    // Publish our service
                    const localSc = modules.getLocalServiceController();
                    const deviceInfo = await localSc.system.getDeviceInfo();
                    this.discovery.hello(deviceInfo);

                    resolve();
                });

                this.server.on('error', (err) => {
                    console.error('TCP server error:', err);
                    reject(err);
                });

            } catch (error) {
                reject(error);
            }
        });
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

        // Stop the server
        if (this.server) {
            promises.push(new Promise<void>((resolve) => {
                this.server!.close(() => {
                    console.log('TCP server stopped');
                    resolve();
                });
            }));
        }

        // Stop discovery
        promises.push(this.discovery.goodbye());

        await Promise.all(promises);
        this.server = null;
    }

    /**
     * Handles incoming TCP connections.
     * @private
     * @param {TcpSocket.Socket} socket - The incoming socket connection.
     */
    private handleIncomingConnection(socket: TcpSocket.Socket): void {
        const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
        this.connections.set(connectionId, socket);

        console.log(`New TCP connection from ${connectionId}`);

        const dataChannel = this.createDataChannel(socket, connectionId);

        if (this.onIncomingConnectionCallback) {
            this.onIncomingConnectionCallback(dataChannel);
        }

        socket.on('close', (hasErr) => {
            console.log(`TCP connection closed: ${connectionId}. Had error: ${hasErr}`);
            this.connections.delete(connectionId);
        });

        socket.on('error', (error) => {
            console.error(`TCP connection error for ${connectionId}:`, error);
            this.connections.delete(connectionId);
        });
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
