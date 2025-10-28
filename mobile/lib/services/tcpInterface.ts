import { ConnectionInterface } from "shared/netService";
import { GenericDataChannel, PeerCandidate } from "shared/types";
import Discovery from "./discovery";
import SupermanModule from "../../modules/superman";

const noop = () => { };

interface TCPConnection {
    connectionId: string;
    dataChannel: GenericDataChannel;
}

/**
 * TCP-based implementation of ConnectionInterface using Bonjour service discovery and Superman native module.
 */
export default class TCPInterface extends ConnectionInterface {
    isSecure = true;
    discovery: Discovery;
    private connections: Map<string, TCPConnection> = new Map();
    private port: number;

    /**
     * Creates an instance of TCPInterface.
     * @param {number} port - The port number for the TCP server and discovery service.
     */
    constructor(port: number) {
        super();
        this.port = port;
        this.discovery = new Discovery();
        this.setupEventListeners();
    }

    /**
     * Sets up event listeners for Superman module TCP events.
     */
    private setupEventListeners(): void {
        SupermanModule.addListener('tcpData', (params: { connectionId: string; data: Uint8Array }) => {
            const connection = this.connections.get(params.connectionId);
            if (connection && connection.dataChannel.onmessage) {
                connection.dataChannel.onmessage(params.data);
            }
        });

        SupermanModule.addListener('tcpError', (params: { connectionId: string; error: string }) => {
            const connection = this.connections.get(params.connectionId);
            if (connection && connection.dataChannel.onerror) {
                connection.dataChannel.onerror(params.error);
            }
        });

        SupermanModule.addListener('tcpClose', (params: { connectionId: string }) => {
            const connection = this.connections.get(params.connectionId);
            if (connection && connection.dataChannel.ondisconnect) {
                connection.dataChannel.ondisconnect();
            }
            this.connections.delete(params.connectionId);
        });
    }

    /**
     * Sets the callback for incoming connections.
     * @param {function} callback - Callback function to handle incoming data channels.
     */
    onIncomingConnection(callback: (dataChannel: GenericDataChannel) => void): void {
        // ignoring since we do not start a server on mobile
    }

    onCandidateAvailable(callback: (candidate: PeerCandidate) => void): void {
        this.discovery.onCandidateAvailable(callback);
    }

    /**
     * Connects to a peer candidate and returns a data channel.
     * @param {PeerCandidate} candidate - The peer candidate to connect to.
     * @returns {Promise<GenericDataChannel>} A promise that resolves to a data channel.
     */
    async connect(candidate: PeerCandidate): Promise<GenericDataChannel> {
        const host = candidate.data?.host || 'localhost';
        const port = candidate.data?.port || this.port;
        console.log(`[TCPInterface] Connecting to ${host}:${port}`, { candidate });
        
        if (host === 'localhost' || host === '127.0.0.1') {
            console.warn('[TCPInterface] WARNING: Using localhost on Android will not work! Use your computer\'s local IP address instead.');
        }
        
        try {
            const connectionId = await SupermanModule.tcpConnect(host, port);
            console.log(`[TCPInterface] Connection established: ${connectionId}`);
            const dataChannel = this.createDataChannel(connectionId);
            
            const connection: TCPConnection = {
                connectionId,
                dataChannel
            };
            
            this.connections.set(connectionId, connection);
            return dataChannel;
        } catch (error) {
            console.error(`[TCPInterface] TCP connection failed to ${host}:${port}:`, error);
            throw error;
        }
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
        this.discovery.scan();
    }

    /**
     * Stops the TCP server and discovery service.
     * @returns {Promise<void>} A promise that resolves when the service is stopped.
     */
    async stop(): Promise<void> {
        const promises: Promise<void>[] = [];

        // Close all connections
        for (const [connectionId] of this.connections) {
            try {
                await SupermanModule.tcpClose(connectionId);
            } catch (error) {
                console.error(`Error closing connection ${connectionId}:`, error);
            }
            this.connections.delete(connectionId);
        }

        // Stop discovery
        promises.push(this.discovery.goodbye());

        await Promise.all(promises);
        
        // Remove event listeners
        SupermanModule.removeAllListeners('tcpData');
        SupermanModule.removeAllListeners('tcpError');
        SupermanModule.removeAllListeners('tcpClose');
    }

    /**
     * Creates a GenericDataChannel wrapper for a TCP connection.
     * @private
     * @param {string} connectionId - The connection identifier.
     * @returns {GenericDataChannel} The data channel wrapper.
     */
    private createDataChannel(connectionId: string): GenericDataChannel {
        let messageHandler: ((data: Uint8Array) => void) = noop;
        let errorHandler: ((ev: Error | string) => void) = noop;
        let disconnectHandler: ((ev?: Error) => void) = noop;

        return {
            send: async (data: Uint8Array) => {
                try {
                    await SupermanModule.tcpSend(connectionId, data);
                } catch (error) {
                    console.error(`Error sending data on connection ${connectionId}:`, error);
                    throw error;
                }
            },

            get onmessage() {
                return messageHandler;
            },

            set onmessage(handler: ((data: Uint8Array) => void)) {
                messageHandler = handler;
            },

            get onerror() {
                return errorHandler;
            },

            set onerror(handler: ((ev: Error | string) => void)) {
                errorHandler = handler;
            },

            get ondisconnect() {
                return disconnectHandler;
            },

            set ondisconnect(handler: (() => void)) {
                disconnectHandler = handler;
            },

            disconnect: async () => {
                console.log(`Disconnecting connection: ${connectionId}`);
                try {
                    await SupermanModule.tcpClose(connectionId);
                    this.connections.delete(connectionId);
                } catch (error) {
                    console.error(`Error disconnecting connection ${connectionId}:`, error);
                }
            }
        };
    }
}
