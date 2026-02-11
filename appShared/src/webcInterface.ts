import { ReDatagram } from "./reUdpProtocol";
import { DatagramCompat } from "./compat";
import { ConnectionInterface } from "./netService";
import { ConnectionType, GenericDataChannel, PeerCandidate, WebcInit, WebcPeerData, WebcReject } from "./types";
import { filterValidBonjourIps } from "./utils";

/*
Establishes a UDP connection to another peer using a intermediatory server for NAT traversal.
*/

const MAX_RETRY_ATTEMPTS = 8;
const RETRY_INTERVAL_MS = 600;
const SAME_NETWORK_ERROR_MSG = 'ERR_LOCAL_NET';
const CONNECTION_TIMEOUT_MS = 30 * 1000; // 30 seconds

type UdpConnectionOptions = {
    dgram: DatagramCompat;
    pin: string;
    serverAddress: string;
    serverPort: number;
    onConnected?: (reDatagram: ReDatagram) => void;
    onError?: (err?: Error | string) => void;
};

export class UdpConnection {
    private dgram: DatagramCompat;
    private pin: string;
    private serverAddress: string;
    private serverPort: number;
    private onConnectedCallback?: (reDatagram: ReDatagram) => void;
    private onErrorCallback?: (err?: Error | string) => void;

    private isServerAcked = false;
    private isTerminated = false;
    private peerAddress?: string;
    private peerPort?: number;
    private reDatagram?: ReDatagram;
    private connectionTimeoutId?: ReturnType<typeof setTimeout>;
    private hasTriedLocalRelay = false;
    private retryAttempts = 0;

    constructor(options: UdpConnectionOptions) {
        this.dgram = options.dgram;
        this.pin = options.pin;
        this.serverAddress = options.serverAddress;
        this.serverPort = options.serverPort;
        this.onConnectedCallback = options.onConnected;
        this.onErrorCallback = options.onError;
    }

    public startConnection() {
        const helloMsg = new TextEncoder().encode(`PIN=${this.pin}`);
        console.log("Starting UDP connection to server:", this.serverAddress, this.serverPort, "with PIN:", this.pin);

        // Set a timeout for the entire connection establishment
        this.connectionTimeoutId = setTimeout(() => {
            if (!this.isTerminated && !this.reDatagram) {
                this.terminate("Connection timeout.");
            }
        }, CONNECTION_TIMEOUT_MS);

        const interval = setInterval(() => {
            if (this.isServerAcked || this.isTerminated || this.retryAttempts > MAX_RETRY_ATTEMPTS) {
                clearInterval(interval);
                if (this.retryAttempts >= MAX_RETRY_ATTEMPTS && !this.isServerAcked && !this.isTerminated) {
                    this.isTerminated = true;
                    this.dgram.close();
                    this.onErrorCallback?.(new Error("Failed to connect to server: Max retry attempts reached."));
                }
                return;
            }
            this.dgram.send(helloMsg, this.serverPort, this.serverAddress);
            this.retryAttempts++;
        }, RETRY_INTERVAL_MS);

        // Send the first hello immediately
        this.dgram.send(helloMsg, this.serverPort, this.serverAddress);

        this.dgram.onMessage = (msg, rinfo) => {
            // verify it's from the server
            if (rinfo.port !== this.serverPort) {
                console.warn("Received message from unknown source:", rinfo);
                return;
            }
            const msgStr = new TextDecoder().decode(msg);
            if (msgStr === "PIN_ACK") {
                this.isServerAcked = true;
                this.dgram.onMessage = undefined; // stop listening for server messages
                console.log("Received PIN_ACK from server.");
                this.checkConnectionEstablished();
            }
            else if (msgStr.startsWith("ERROR=")) {
                const errorMsg = msgStr.substring(6);
                // Handle same network error specially - don't terminate, switch to local relay
                if (errorMsg === SAME_NETWORK_ERROR_MSG) {
                    console.log("[UdpConnection] Received same network error from server, switching to local relay.");
                    this.switchToLocalNetwork();
                    return;
                }
                console.error("Server error:", errorMsg);
                this.isTerminated = true;
                this.onErrorCallback?.(new Error(errorMsg));
                this.dgram.close();
            }
            else {
                console.warn("Unexpected message from server:", msgStr);
            }
        };

        this.dgram.onError = (err) => {
            // Socket errors are common during app background/foreground transitions
            console.warn("Datagram error:", err.message || err);
            this.isTerminated = true;
            this.dgram.onMessage = undefined;
            this.dgram.close();
            this.onErrorCallback?.(err);
        };

        this.dgram.onClose = () => {
            console.log("Datagram socket closed.");
            this.isTerminated = true;
            this.dgram.onMessage = undefined;
            this.dgram.onError = undefined;
            this.dgram.onClose = undefined;
            this.onErrorCallback?.();
        };
    }

    public addPeerDetails(peerAddress: string, peerPort: number) {
        if (this.isTerminated) {
            console.warn("[UdpConnection] Connection terminated, ignoring peer details.");
            return;
        }
        console.log("Received peer details:", peerAddress, peerPort);
        this.peerAddress = peerAddress;
        this.peerPort = peerPort;
        this.checkConnectionEstablished();
    }

    /**
 * Get local network addresses for local relay fallback.
 * Default implementation gets addresses from the LOCAL (TCP) connection interface.
 * Can be overridden by platform-specific implementations if needed.
 */
    private getLocalAddresses(): string[] {
        try {
            const localSc = modules.getLocalServiceController();
            const tcpInterface = localSc.net.getConnectionInterface(ConnectionType.LOCAL);
            if (tcpInterface) {
                return filterValidBonjourIps(tcpInterface.getServiceAddresses());
            }
        } catch (err) {
            console.warn('[WebCInterface] Failed to get local addresses:', err);
        }
        return [];
    }

    /**
     * Handle same network error by requesting local relay.
     * Gets local addresses and port, then calls the API to request local relay.
     * Returns true if local relay was requested, false if already tried or failed.
     */
    public async switchToLocalNetwork(): Promise<boolean> {
        if (this.isTerminated) {
            console.warn('[UdpConnection] Connection already terminated, cannot switch to local network.');
            return false;
        }

        // Server responded with same-network indication, mark as acked
        // and stop listening for server UDP messages.
        // This can be called from both the WebSocket reject handler and the
        // UDP error handler, so guard against double-setting.
        if (!this.isServerAcked) {
            this.isServerAcked = true;
            this.dgram.onMessage = undefined;
        }

        if (this.hasTriedLocalRelay) {
            // Even though we can't retry, check if connection can now be
            // established (peer data may have arrived while isServerAcked was false).
            this.checkConnectionEstablished();
            return false;
        }

        this.hasTriedLocalRelay = true;

        const localAddresses = this.getLocalAddresses();
        const localPort = this.getLocalPort();

        if (!localAddresses.length || !localPort) {
            console.warn('[UdpConnection] Cannot request local relay: no local addresses or port available.');
            this.terminate('No local addresses available for local relay.');
            return false;
        }

        console.log('[UdpConnection] Same network detected, requesting local relay. PIN:', this.pin, 'Addresses:', localAddresses, 'Port:', localPort);

        try {
            const localSc = modules.getLocalServiceController();
            await localSc.account.requestWebcLocal(this.pin, localAddresses, localPort);
            console.log('[UdpConnection] Local relay request sent, waiting for new peer data...');
            // Check in case peer data arrived during the async request
            this.checkConnectionEstablished();
            return true;
        } catch (err: any) {
            console.error('[UdpConnection] Failed to request local relay:', err);
            this.terminate(err?.message || 'Local relay request failed');
            return false;
        }
    }

    public terminate(err?: string) {
        if (this.isTerminated) {
            return;
        }
        this.isTerminated = true;
        if (this.connectionTimeoutId) {
            clearTimeout(this.connectionTimeoutId);
            this.connectionTimeoutId = undefined;
        }
        if (err) {
            this.onErrorCallback?.(err);
        }
        if (this.reDatagram) {
            this.reDatagram.close();
        } else {
            this.dgram.close();
        }
    }

    private checkConnectionEstablished() {
        if (this.peerAddress && this.peerPort && this.isServerAcked && !this.isTerminated && !this.reDatagram) {
            console.log("UDP server handshake complete. Peer to connect:", this.peerAddress, this.peerPort);
            // Remove dgram event handlers to avoid interference
            this.dgram.onMessage = undefined;
            this.dgram.onError = undefined;
            this.dgram.onClose = undefined;
            // Create ReDatagram layer
            this.reDatagram = new ReDatagram(this.dgram, this.peerAddress, this.peerPort, (isSuccess: boolean) => {
                if (this.connectionTimeoutId) {
                    clearTimeout(this.connectionTimeoutId);
                    this.connectionTimeoutId = undefined;
                }
                if (!isSuccess) {
                    this.isTerminated = true;
                    this.reDatagram = undefined;
                    // reDatagram should have closed the dgram already.
                    this.onErrorCallback?.(new Error("Failed to establish ReDatagram connection."));
                    return;
                }
                this.onConnectedCallback?.(this.reDatagram);
            });
        }
    }

    public getReDatagram(): ReDatagram | undefined {
        return this.reDatagram;
    }

    public getLocalPort(): number | null {
        try {
            return this.dgram.address().port;
        } catch {
            return null;
        }
    }

    public isConnectionTerminated(): boolean {
        return this.isTerminated;
    }
}

const DEFAULT_SERVER_PORT = 9669;

export abstract class WebcInterface extends ConnectionInterface {
    isSecure = false;
    private onIncomingConnectionCallback: ((dataChannel: GenericDataChannel) => void) | null = null;

    private waitingForPeerData = new Map<string, { connection: UdpConnection, cleanupTimer: number }>();
    private waitingPeerData = new Map<string, { isReject: boolean, peerData?: WebcPeerData, cleanupTimer: number, sameNetworkError?: boolean }>();

    abstract createDatagramSocket(): DatagramCompat;



    onIncomingConnection(callback: (dataChannel: GenericDataChannel) => void) {
        this.onIncomingConnectionCallback = callback;
    }

    onCandidateAvailable(callback: (candidate: PeerCandidate) => void): void {
        // No-op for WebC interface
    }

    private getDefaultServerAddress(): string {
        const serverUrl = new URL(modules.config.SERVER_URL);
        return serverUrl.hostname;
    }

    private async setupConnection(webcInit: WebcInit): Promise<GenericDataChannel> {
        const dgram = this.createDatagramSocket();
        await dgram.bind();
        console.log("[WebCInterface] Datagram socket bound for connection:", dgram.address());

        const localSc = modules.getLocalServiceController();

        return new Promise<GenericDataChannel>((resolve, reject) => {
            let isSettled = false;

            const udpConnection = new UdpConnection({
                dgram,
                pin: webcInit.pin,
                serverAddress: webcInit.serverAddress || this.getDefaultServerAddress(),
                serverPort: webcInit.serverPort || DEFAULT_SERVER_PORT,
                onConnected: (reDatagram) => {
                    const dataChannel = this.createDataChannel(reDatagram);
                    if (!isSettled) {
                        isSettled = true;
                        resolve(dataChannel);
                    }
                },
                onError: (err?) => {
                    if (!isSettled) {
                        isSettled = true;
                        reject(err || new Error("UDP socket closed."));
                    }
                },
            });

            udpConnection.startConnection();

            // check if we already have peer data waiting
            const waitingEntry = this.waitingPeerData.get(webcInit.pin);
            if (waitingEntry) {
                clearTimeout(waitingEntry.cleanupTimer);
                if (waitingEntry.isReject || !waitingEntry.peerData) {
                    if (waitingEntry.sameNetworkError) {
                        // Handle same network error asynchronously
                        udpConnection.switchToLocalNetwork();
                    } else {
                        udpConnection.terminate("Connection rejected.");
                    }
                }
                else {
                    console.log("[WebCInterface] Found waiting peer data for PIN:", webcInit.pin, waitingEntry.peerData);
                    udpConnection.addPeerDetails(waitingEntry.peerData.peerAddress, waitingEntry.peerData.peerPort);
                }
                this.waitingPeerData.delete(webcInit.pin);
                return;
            }

            // If not, wait for peer data to arrive
            const timer = setTimeout(() => {
                if (!this.waitingForPeerData.has(webcInit.pin)) {
                    return;
                }
                const entry = this.waitingForPeerData.get(webcInit.pin);
                this.waitingForPeerData.delete(webcInit.pin);
                if (isSettled) {
                    return;
                }
                isSettled = true;
                entry.connection.terminate();
                reject(new Error("Timed out waiting for peer data."));
            }, 60000); // 60 seconds timeout
            this.waitingForPeerData.set(webcInit.pin, {
                connection: udpConnection,
                cleanupTimer: timer
            });
        });
    }

    async connect(candidate: PeerCandidate): Promise<GenericDataChannel> {
        console.log("[WebCInterface] Connecting to WebC peer:", candidate);
        const localSc = modules.getLocalServiceController();
        const webcInit = await localSc.account.requestWebcInit(candidate.fingerprint);
        return this.setupConnection(webcInit);
    }
    async getCandidates(fingerprint?: string): Promise<PeerCandidate[]> {
        if (!fingerprint) {
            return [];
        }
        const localSc = modules.getLocalServiceController();
        if (!localSc.account.isLinked()) {
            return [];
        }
        try {
            const isOnline = await localSc.account.isPeerOnline(fingerprint);
            if (isOnline) {
                return [{
                    connectionType: ConnectionType.WEB,
                    fingerprint,
                    data: null,
                    expiry: Date.now() + 60 * 1000, // 1 min expiry
                }];
            }
        } catch (err) {
            console.warn("[WebCInterface] Failed to check if peer is online:", err);
        }
        return [];
    }

    createDataChannel(reDgram: ReDatagram): GenericDataChannel {
        let messageHandler: ((ev: Uint8Array) => void) | null = null;
        let errorHandler: ((ev: Error | string) => void) | null = null;
        let disconnectHandler: ((ev?: Error) => void) | null = null;

        reDgram.onMessage = (msg: Uint8Array) => {
            if (messageHandler) {
                messageHandler(msg);
            }
        };

        reDgram.onClose = (err: Error) => {
            if (err && errorHandler) {
                errorHandler(err);
            }
            if (disconnectHandler) {
                disconnectHandler();
            }
        };

        return {
            send: (data: Uint8Array) => {
                return reDgram.send(data);
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
                reDgram.close();
            }
        };
    }

    async start(): Promise<void> {
        const localSc = modules.getLocalServiceController();
        localSc.account.webcInitSignal.add(async (webcInit: WebcInit) => {
            try {
                const dataChannel = await this.setupConnection(webcInit);
                if (this.onIncomingConnectionCallback) {
                    this.onIncomingConnectionCallback(dataChannel);
                }
            } catch (err) {
                // Connection failures are common during app background/foreground transitions
                console.warn("[WebCInterface] Failed to establish incoming WebC connection:", err.message || err);
            }
        });

        localSc.account.webcPeerDataSignal.add(async (webcPeerData: WebcPeerData) => {
            const waitingEntry = this.waitingForPeerData.get(webcPeerData.pin);
            if (waitingEntry) {
                clearTimeout(waitingEntry.cleanupTimer);
                waitingEntry.connection.addPeerDetails(webcPeerData.peerAddress, webcPeerData.peerPort);
                this.waitingForPeerData.delete(webcPeerData.pin);
            } else {
                console.warn("[WebCInterface] Received WebC peer data before server handshake for PIN:", webcPeerData.pin);
                const cleanupTimer = setTimeout(() => {
                    this.waitingPeerData.delete(webcPeerData.pin);
                }, 2 * 60000); // 2 minutes timeout
                this.waitingPeerData.set(webcPeerData.pin, { isReject: false, peerData: webcPeerData, cleanupTimer });
            }
        });

        localSc.account.webcRejectSignal.add((webcReject: WebcReject) => {
            const isSameNetworkError = webcReject.message === SAME_NETWORK_ERROR_MSG;
            const waitingEntry = this.waitingForPeerData.get(webcReject.pin);
            if (waitingEntry) {
                clearTimeout(waitingEntry.cleanupTimer);
                if (isSameNetworkError) {
                    // Don't terminate, let UdpConnection handle local relay
                    waitingEntry.connection.switchToLocalNetwork();
                } else {
                    waitingEntry.connection.terminate(webcReject.message);
                    this.waitingForPeerData.delete(webcReject.pin);
                }
                console.warn("WebC connection rejected for PIN:", webcReject.pin, "Message:", webcReject.message);
            } else {
                const cleanupTimer = setTimeout(() => {
                    this.waitingPeerData.delete(webcReject.pin);
                }, 2 * 60000); // 2 minutes timeout
                this.waitingPeerData.set(webcReject.pin, { isReject: true, cleanupTimer, sameNetworkError: isSameNetworkError });
            }
        });
    }

    async stop(): Promise<void> {
    }
}
