import { ConnectionInterface } from "shared/netService";
import { GenericDataChannel, PeerCandidate, ConnectionType } from "shared/types";
import net from "node:net";
import Discovery from "./discovery";
import { filterValidBonjourIps } from "shared/utils";

/**
 * TCP-based implementation of ConnectionInterface using Bonjour service discovery.
 */
export default class TCPInterface extends ConnectionInterface {
    isSecure = false; // TCP connections are only established over local networks only so we are avoiding encryption overhead.
    priority = 1;
    discovery: Discovery;
    private server: net.Server | null = null;
    private connections: Map<string, net.Socket> = new Map();
    private port: number;
    private onIncomingConnectionCallback: ((dataChannel: GenericDataChannel, fingerprint?: string) => void) | null = null;
    private _started: boolean = false;

    /**
     * Creates an instance of TCPInterface.
     * @param {number} port - The port number for the TCP server and discovery service.
     */
    constructor(port: number) {
        super();
        this.port = port;
        this.discovery = new Discovery(port);
    }

    getServicePort(): number | null {
        if (this.server && this.server.listening) {
            return this.port;
        }
        return null;
    }

    getServiceAddresses(): string[] {
        return this.discovery.getHostLocalAddresses();
    }

    isActive(): boolean {
        return this._started;
    }

    /**
     * Sets the callback for incoming connections.
     * @param {function} callback - Callback function to handle incoming data channels.
     */
    onIncomingConnection(callback: (dataChannel: GenericDataChannel, fingerprint?: string) => void): void {
        this.onIncomingConnectionCallback = callback;
    }

    /**
     * Connects to a peer candidate and returns a data channel.
     * Races all candidate hosts in parallel and returns the first successful socket,
     * destroying any remaining sockets once a winner is found.
     * @param {PeerCandidate} candidate - The peer candidate to connect to.
     * @returns {Promise<GenericDataChannel>} A promise that resolves to a data channel.
     */
    async connect(candidate: PeerCandidate): Promise<GenericDataChannel> {
        const hosts = candidate.data?.hosts || [];
        const port = candidate.data?.port || this.port;

        if (hosts.length === 0) {
            throw new Error("No hosts provided");
        }

        return new Promise((resolve, reject) => {
            let resolved = false;
            let failCount = 0;
            const sockets: net.Socket[] = [];
            const failed = new Set<net.Socket>();

            const onFail = (socket: net.Socket) => {
                if (resolved || failed.has(socket)) return;
                failed.add(socket);
                socket.destroy();
                failCount++;
                if (failCount >= hosts.length) {
                    reject(new Error("No reachable hosts found"));
                }
            };

            for (const host of hosts) {
                const socket = new net.Socket();
                sockets.push(socket);
                socket.setTimeout(3000);

                socket.connect(port, host, () => {
                    if (resolved) {
                        socket.destroy();
                        return;
                    }
                    resolved = true;
                    socket.setTimeout(0);
                    socket.setKeepAlive(true);
                    const connectionId = `${host}:${port}`;
                    this.connections.set(connectionId, socket);

                    // Destroy all other in-flight sockets
                    for (const s of sockets) {
                        if (s !== socket) s.destroy();
                    }

                    const dataChannel = this.createDataChannel(socket, connectionId);
                    resolve(dataChannel);
                });

                socket.on('error', () => onFail(socket));
                socket.on('timeout', () => onFail(socket));
            }
        });
    }

    /**
     * Gets available peer candidates using the discovery service.
     * @param {string} [fingerprint] - Optional fingerprint to filter candidates.
     * @returns {Promise<PeerCandidate[]>} A promise that resolves to an array of peer candidates.
     */
    async getCandidates(fingerprint?: string): Promise<PeerCandidate[]> {
        return new Promise((resolve) => {
            const candidates = this.discovery.getCandidates(false); // trigger a scan
            if (fingerprint) {
                const filtered = candidates.filter(candidate => candidate.fingerprint === fingerprint);
                if (filtered.length > 0) {
                    return resolve(filtered);
                } else {
                    // check cache from discovery
                    const cachedCandidate = this.discovery.getCandidateFromCache(fingerprint);
                    if (cachedCandidate) {
                        console.log('[TCPInterface] Resolving candidate from cache for fingerprint:', fingerprint);
                        return resolve([cachedCandidate]);
                    }
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

    private setupConnectListener() {
        const localSc = modules.getLocalServiceController();
        localSc.account.peerConnectRequestSignal.add(async (request) => {
            console.log('[TCPInterface] Received peer connect request via account server:', request);
            const validHosts = filterValidBonjourIps(request.addresses);
            if (validHosts.length === 0) {
                console.warn('[TCPInterface] No valid local addresses in connect request, ignoring.');
                return;
            }
            try {
                const dataChannel = await this.connect({
                    fingerprint: request.fingerprint,
                    connectionType: ConnectionType.LOCAL,
                    data: {
                        hosts: validHosts,
                        port: request.port,
                    },
                });
                if (this.onIncomingConnectionCallback) {
                    this.onIncomingConnectionCallback(dataChannel, request.fingerprint);
                }
            } catch (error) {
                console.error('[TCPInterface] Error connecting to peer from connect request:', error);
            }
        });
    }

    /**
     * Starts the TCP server and discovery service.
     * @returns {Promise<void>} A promise that resolves when the service is started.
     */
    async start(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                await this.discovery.setup();
                this.setupConnectListener();
                this._started = true;
                // Start the TCP server
                this.server = net.createServer({
                    keepAlive: true,
                }, (socket) => {
                    this.handleIncomingConnection(socket);
                });

                this.server.listen({
                    port: this.port,
                    host: '0.0.0.0'
                }, async () => {
                    console.log(`[TCPInterface] TCP server listening on port ${this.port}`);

                    // Start discovery service
                    this.discovery.listen();

                    // Publish our service
                    const localSc = modules.getLocalServiceController();
                    const deviceInfo = await localSc.system.getDeviceInfo();
                    this.discovery.hello(deviceInfo);

                    resolve();
                });

                this.server.on('error', (err) => {
                    console.error('[TCPInterface] TCP server error:', err);
                    this.server = null;
                    const localSc = modules.getLocalServiceController();
                    localSc.system.alert(
                        'Local Network Error',
                        `Other devices won't be able to discover this device on the local network. ${err.message || ''}`,
                    );
                    resolve(); // Resolve instead of reject to avoid crashing
                });
            } catch (error) {
                console.error('[TCPInterface] Error starting:', error);
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
                    console.log('[TCPInterface] TCP server stopped');
                    resolve();
                });
            }));
        }

        // Stop discovery
        promises.push(this.discovery.goodbye());

        await Promise.all(promises);
        await this.discovery.goodbye();
        this.server = null;
        this._started = false;
    }

    /**
     * Handles incoming TCP connections.
     * @private
     * @param {net.Socket} socket - The incoming socket connection.
     */
    private handleIncomingConnection(socket: net.Socket): void {
        const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
        this.connections.set(connectionId, socket);

        console.log(`[TCPInterface] New connection: ${connectionId}`);

        const dataChannel = this.createDataChannel(socket, connectionId);

        if (this.onIncomingConnectionCallback) {
            this.onIncomingConnectionCallback(dataChannel);
        }

        socket.on('close', (hasErr) => {
            console.log(`[TCPInterface] Connection closed: ${connectionId}. Had error: ${hasErr}`);
            this.connections.delete(connectionId);
        });

        socket.on('error', (error) => {
            console.error(`[TCPInterface] Connection error ${connectionId}:`, error);
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
    private createDataChannel(socket: net.Socket, connectionId: string): GenericDataChannel {
        let messageHandler: ((data: Uint8Array) => void) | null = null;
        let errorHandler: ((ev: Error | string) => void) | null = null;
        let disconnectHandler: ((ev?: Error) => void) | null = null;

        // Set up data parsing for incoming messages
        socket.on('data', (data) => {
            if (messageHandler) {
                // Create a MessageEvent-like object
                messageHandler(data);
            }
        });

        socket.on('error', (error) => {
            if (errorHandler) {
                errorHandler(error);
            }
        });

        socket.on('close', (hadErr) => {
            console.debug(`[TCPInterface] Socket ${connectionId} closed. Had error: ${hadErr}`);
            if (disconnectHandler) {
                disconnectHandler(hadErr ? new Error('Socket closed due to error') : undefined);
            }
            if (this.connections.has(connectionId)) {
                this.connections.delete(connectionId);
            }
        });

        return {
            send: (data: Uint8Array): Promise<void> => {
                return new Promise((resolve, reject) => {
                    if (socket.writable) {
                        socket.write(data, (err) => {
                            if (err) {
                                console.error(`[TCPInterface] Error sending data on ${connectionId}:`, err);
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    } else {
                        console.warn(`[TCPInterface] Attempted to send on closed socket: ${connectionId}`);
                        reject(new Error(`Socket ${connectionId} is not writable`));
                    }
                });
            },

            get onmessage() {
                return messageHandler;
            },

            set onmessage(handler: ((ev: ArrayBufferView) => void) | null) {
                messageHandler = handler;
            },

            get onerror() {
                return errorHandler;
            },

            set onerror(handler: ((ev: Error | string) => void) | null) {
                errorHandler = handler;
            },

            get ondisconnect() {
                return disconnectHandler;
            },

            set ondisconnect(handler: ((ev: Error | string) => void) | null) {
                disconnectHandler = handler;
            },

            disconnect: () => {
                console.debug(`[TCPInterface] Disconnecting socket: ${connectionId}`);
                socket.end();
                this.connections.delete(connectionId);
            }
        };
    }

    onCandidateAvailable(callback: (candidate: PeerCandidate) => void): void {
        this.discovery.onCandidateFound(callback);
    }
}
