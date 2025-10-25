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
                const messageEvent = {
                    data: params.data
                } as MessageEvent;
                connection.dataChannel.onmessage(messageEvent);
            }
        });

        SupermanModule.addListener('tcpError', (params: { connectionId: string; error: string }) => {
            const connection = this.connections.get(params.connectionId);
            if (connection && connection.dataChannel.onerror) {
                const errorEvent = {
                    error: new Error(params.error)
                } as ErrorEvent;
                connection.dataChannel.onerror(errorEvent);
            }
        });

        SupermanModule.addListener('tcpClose', (params: { connectionId: string }) => {
            const connection = this.connections.get(params.connectionId);
            if (connection && connection.dataChannel.ondisconnect) {
                const closeEvent = {
                    code: 1000,
                    reason: 'Connection closed'
                } as CloseEvent;
                connection.dataChannel.ondisconnect(closeEvent);
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

    /**
     * Connects to a peer candidate and returns a data channel.
     * @param {PeerCandidate} candidate - The peer candidate to connect to.
     * @returns {Promise<GenericDataChannel>} A promise that resolves to a data channel.
     */
    async connect(candidate: PeerCandidate): Promise<GenericDataChannel> {
        const host = candidate.data?.host || 'localhost';
        const port = candidate.data?.port || this.port;

        try {
            const connectionId = await SupermanModule.tcpConnect(host, port);
            const dataChannel = this.createDataChannel(connectionId);
            
            const connection: TCPConnection = {
                connectionId,
                dataChannel
            };
            
            this.connections.set(connectionId, connection);
            return dataChannel;
        } catch (error) {
            console.error('TCP connection error:', error);
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
        let messageHandler: ((ev: MessageEvent) => void) = noop;
        let errorHandler: ((ev: ErrorEvent) => void) = noop;
        let disconnectHandler: ((ev: CloseEvent) => void) = noop;

        return {
            send: async (data: ArrayBufferView) => {
                try {
                    const uint8Array = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                    await SupermanModule.tcpSend(connectionId, uint8Array);
                } catch (error) {
                    console.error(`Error sending data on connection ${connectionId}:`, error);
                    throw error;
                }
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
