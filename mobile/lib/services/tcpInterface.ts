import { ConnectionInterface } from "shared/netService";
import { GenericDataChannel, PeerCandidate } from "shared/types";
import Discovery from "./discovery";
import SupermanModule from "../../modules/superman";
import * as Network from 'expo-network';
import { NetworkState, NetworkStateType } from "expo-network";
import { EventSubscription } from 'expo-modules-core';

const UNSUPPORTED_NETWORK_TYPES = [
    NetworkStateType.CELLULAR,
    NetworkStateType.NONE,
    NetworkStateType.UNKNOWN,
];

const noop = () => { };

interface TCPConnection {
    connectionId: string;
    dataChannel: GenericDataChannel;
    isIncoming: boolean;
}

/**
 * TCP-based implementation of ConnectionInterface using Bonjour service discovery and Superman native module.
 */
export default class TCPInterface extends ConnectionInterface {
    isSecure = true;
    discovery: Discovery;
    private connections: Map<string, TCPConnection> = new Map();
    private port: number;
    private incomingConnectionCallback: ((dataChannel: GenericDataChannel) => void) | null = null;
    private serverStarted: boolean = false;
    private networkSupported: boolean = false;
    private netChangeSub: EventSubscription | null = null;

    /**
     * Creates an instance of TCPInterface.
     * @param {number} port - The port number for the TCP server and discovery service.
     */
    constructor(port: number) {
        super();
        this.port = port;
        this.discovery = new Discovery(port);
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
            } else if (!connection) {
                console.warn(`[TCPInterface] Received data for unknown connection: ${params.connectionId}`);
            }
        });

        SupermanModule.addListener('tcpError', (params: { connectionId: string; error: string }) => {
            const connection = this.connections.get(params.connectionId);
            if (!connection) return;

            // Check if this is a connection abort error (happens on background/foreground)
            const isConnectionAbort = params.error.includes('error 53') ||
                params.error.includes('connection abort') ||
                params.error.includes('Connection reset');

            if (isConnectionAbort) {
                // Treat as a disconnect rather than an error
                console.log(`[TCPInterface] Connection ${params.connectionId} was aborted, treating as disconnect`);
                this.triggerDCDisconnect(params.connectionId);
            } else {
                // Regular error
                if (connection.dataChannel.onerror) {
                    connection.dataChannel.onerror(params.error);
                }
            }
        });

        SupermanModule.addListener('tcpClose', (params: { connectionId: string }) => {
            this.triggerDCDisconnect(params.connectionId);
        });

        SupermanModule.addListener('tcpIncomingConnection', (params: { connectionId: string }) => {
            console.log(`[TCPInterface] Incoming connection: ${params.connectionId}`);
            const dataChannel = this.createDataChannel(params.connectionId);

            const connection: TCPConnection = {
                connectionId: params.connectionId,
                dataChannel,
                isIncoming: true,
            };

            this.connections.set(params.connectionId, connection);

            if (this.incomingConnectionCallback) {
                this.incomingConnectionCallback(dataChannel);
            }
        });
    }

    /**
     * Sets the callback for incoming connections.
     * @param {function} callback - Callback function to handle incoming data channels.
     */
    onIncomingConnection(callback: (dataChannel: GenericDataChannel) => void): void {
        this.incomingConnectionCallback = callback;
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
        if (!this.networkSupported) {
            throw new Error('Network is unsupported, cannot connect to candidate.');
        }
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
                dataChannel,
                isIncoming: false,
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
        if (!this.networkSupported) {
            console.log('[TCPInterface] Network is unsupported, returning no candidates.');
            return [];
        }
        return new Promise((resolve) => {
            const candidates = this.discovery.getCandidates(false); // trigger a scan
            if (fingerprint) {
                const filtered = candidates.filter(candidate => candidate.fingerprint === fingerprint);
                if (filtered.length > 0) {
                    return resolve(filtered);
                }
            }

            // Wait a bit for discovery to update
            setTimeout(() => {
                const candidates = this.discovery.getCandidates(true);

                if (fingerprint) {
                    const filtered = candidates.filter(candidate => candidate.fingerprint === fingerprint);
                    resolve(filtered);
                } else {
                    resolve(candidates);
                }
            }, 2000);
        });
    }

    /**
     * Starts the TCP server and discovery service.
     * @returns {Promise<void>} A promise that resolves when the service is started.
     */
    async start(): Promise<void> {
        const netState = await Network.getNetworkStateAsync();
        if (this.isNetworkSupported(netState)) {
            await this.onSupportedNetwork();
        } else {
            console.log('[TCPInterface] Network is not supported, not starting server or discovery.', netState);
        }
        // Subscribe to network changes
        this.netChangeSub = Network.addNetworkStateListener(async (state) => {
            console.log('[TCPInterface] Network state changed:', state);
            if (this.isNetworkSupported(state)) {
                await this.onSupportedNetwork();
            } else {
                await this.onUnsupportedNetwork();
            }
        });
    }

    isNetworkSupported(netState: NetworkState): boolean {
        if (!netState.isConnected) {
            return false;
        }
        // For now, if type isnt defined, assume supported (e.g on simulators)
        if (!netState.type) {
            console.log('[TCPInterface] Network type is undefined, assuming supported.', netState);
            return true;
        }
        return !UNSUPPORTED_NETWORK_TYPES.includes(netState.type);
    }

    startDiscoveryScan() {
        this.discovery.scan();
    }

    async startServerAndPublish(): Promise<void> {
        if (!this.serverStarted) {
            try {
                const port = await this.startServer();
                const localSc = modules.getLocalServiceController();
                const deviceInfo = await localSc.system.getDeviceInfo();
                this.discovery.hello(deviceInfo, port);
            } catch (error) {
                console.error('[TCPInterface] Failed to start TCP server during start():', error);
            }
        }
    }

    /**
     * Starts the TCP server for incoming connections.
     * @param {number} [port] - Optional port to start the server on. Defaults to the instance port.
     * @returns {Promise<number>} A promise that resolves to the actual port the server is listening on.
     */
    async startServer(port?: number): Promise<number> {
        const serverPort = port ?? this.port;
        try {
            const result = await SupermanModule.tcpStartServer(serverPort);
            console.log(`[TCPInterface] TCP server started on port ${result.port}`);
            this.serverStarted = true;
            return result.port;
        } catch (error) {
            console.error('[TCPInterface] Failed to start TCP server:', error);
            throw error;
        }
    }

    async stopServer(): Promise<void> {
        // Stop the server if running
        if (this.serverStarted) {
            try {
                await SupermanModule.tcpStopServer();
                console.log('[TCPInterface] TCP server stopped');
                this.serverStarted = false;
            } catch (error) {
                console.error('[TCPInterface] Error stopping TCP server:', error);
            }
        }
    }

    async stopDiscovery(): Promise<void> {
        await this.discovery.goodbye();
    }

    /**
     * Stops the TCP server and discovery service.
     * @returns {Promise<void>} A promise that resolves when the service is stopped.
     */
    async stop(): Promise<void> {
        if (this.netChangeSub) {
            this.netChangeSub.remove();
            this.netChangeSub = null;
        }

        await this.stopServer();

        // Close all connections
        for (const [connectionId] of this.connections) {
            try {
                await SupermanModule.tcpClose(connectionId);
            } catch (error) {
                console.error(`Error closing connection ${connectionId}:`, error);
            }
            this.connections.delete(connectionId);
        }

        await this.stopDiscovery();

        // Remove event listeners
        SupermanModule.removeAllListeners('tcpData');
        SupermanModule.removeAllListeners('tcpError');
        SupermanModule.removeAllListeners('tcpClose');
        SupermanModule.removeAllListeners('tcpIncomingConnection');
    }

    async onUnsupportedNetwork() {
        console.log('[TCPInterface] Network is unsupported, stopping server and discovery.');
        this.networkSupported = false;
        await this.stopServer();
        await this.stopDiscovery();
    }

    async onSupportedNetwork() {
        console.log('[TCPInterface] Network is supported, starting server and discovery.');
        this.networkSupported = true;
        await this.startServerAndPublish();
        this.startDiscoveryScan();
    }

    triggerDCDisconnect(connectionId: string): boolean {
        const connection = this.connections.get(connectionId);
        if (connection) {
            if (connection.dataChannel.ondisconnect) {
                connection.dataChannel.ondisconnect();
            }
            this.connections.delete(connectionId);
            return true;
        }
        return false;
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
                const result = await SupermanModule.tcpSend(connectionId, data);
                if (result === false) {
                    // Connection was closed on native side
                    // Throw error only if its already been cleaned up, i.e a potential memory leak
                    if (!this.connections.has(connectionId)) {
                        throw new Error(`Can't send data, connection ${connectionId} is closed.`);
                    }
                    setTimeout(() => {
                        this.triggerDCDisconnect(connectionId);
                    }, 0);
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
                this.connections.delete(connectionId);
                await SupermanModule.tcpClose(connectionId);
            }
        };
    }
}
