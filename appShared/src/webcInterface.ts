import { ReDatagram } from "./reUdpProtocol";
import { DatagramCompat } from "./compat";
import { ConnectionInterface } from "./netService";
import { ConnectionType, GenericDataChannel, PeerCandidate, WebcInit, WebcPeerData } from "./types";

/*
Establishes a UDP connection to another peer using a intermediatory server for NAT traversal.
*/

const MAX_RETRY_ATTEMPTS = 8;
const RETRY_INTERVAL_MS = 600;

export class UdpConnection {
    private dgram: DatagramCompat;
    private onConnectedCallback?: (reDatagram: ReDatagram) => void;
    private onErrorCallback?: (err: Error) => void;
    private isServerAcked = false;
    private isError = false;
    private peerAddress?: string;
    private peerPort?: number;
    private reDatagram?: ReDatagram;

    constructor(dgram: DatagramCompat, onConnectedCallback?: (reDatagram: ReDatagram) => void, onErrorCallback?: (err: Error) => void) {
        this.dgram = dgram;
        this.onConnectedCallback = onConnectedCallback;
        this.onErrorCallback = onErrorCallback;
    }

    private retryAttempts = 0;

    public startConnection(serverAddress: string, serverPort: number, pin: string) {
        const helloMsg = new TextEncoder().encode(`PIN=${pin}`);
        console.log("Starting UDP connection to server:", serverAddress, serverPort, "with PIN:", pin);
        const interval = setInterval(() => {
            if (this.isServerAcked || this.isError || this.retryAttempts > MAX_RETRY_ATTEMPTS) {
                clearInterval(interval);
                if (this.retryAttempts >= MAX_RETRY_ATTEMPTS && !this.isServerAcked) {
                    this.dgram.close();
                    this.onErrorCallback?.(new Error("Failed to connect to server: Max retry attempts reached."));
                }
                return;
            }
            this.dgram.send(helloMsg, serverPort, serverAddress);
            this.retryAttempts++;
        }, RETRY_INTERVAL_MS);

        // Send the first hello immediately
        this.dgram.send(helloMsg, serverPort, serverAddress);

        this.dgram.onMessage = (msg, rinfo) => {
            // verify it's from the server
            if (rinfo.port !== serverPort) {
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
                console.error("Server error:", errorMsg);
                this.onErrorCallback?.(new Error(errorMsg));
                this.isError = true;
                this.dgram.onMessage = undefined;
            }
            else {
                console.warn("Unexpected message from server:", msgStr);
            }
        };

        this.dgram.onError = (err) => {
            console.error("Datagram error:", err);
            this.onErrorCallback?.(err);
            this.isError = true;
            this.dgram.onMessage = undefined;
        };
    }

    public addPeerDetails(peerAddress: string, peerPort: number) {
        console.log("Received peer details:", peerAddress, peerPort);
        this.peerAddress = peerAddress;
        this.peerPort = peerPort;
        this.checkConnectionEstablished();
    }

    private checkConnectionEstablished() {
        if (this.peerAddress && this.peerPort && this.isServerAcked && !this.isError && !this.reDatagram) {
            console.log("UDP server handshake complete. Peer to connect:", this.peerAddress, this.peerPort);
            this.reDatagram = new ReDatagram(this.dgram, this.peerAddress, this.peerPort, () => {
                console.log("UDP connection established to peer.");
                this.onConnectedCallback?.(this.reDatagram);
            });
        }
    }

    public getReDatagram(): ReDatagram | undefined {
        return this.reDatagram;
    }
}

const DEFAULT_SERVER_PORT = 9669;

export abstract class WebcInterface extends ConnectionInterface {
    isSecure = false;
    private onIncomingConnectionCallback: ((dataChannel: GenericDataChannel) => void) | null = null;

    private waitingForPeerData = new Map<string, { connection: UdpConnection, cleanupTimer: number }>();

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
        console.log("Datagram socket bound for WebC connection:", dgram.address());
        return new Promise<GenericDataChannel>((resolve, reject) => {
            const udpConnection = new UdpConnection(dgram, (reDatagram) => {
                const dataChannel = this.createDataChannel(reDatagram);
                resolve(dataChannel);
            }, (err) => {
                reject(err);
            });

            udpConnection.startConnection(
                webcInit.serverAddress || this.getDefaultServerAddress(),
                webcInit.serverPort || DEFAULT_SERVER_PORT,
                webcInit.pin
            );

            // check if we already have peer data waiting
            const waitingEntry = this.waitingPeerData.get(webcInit.pin);
            if (waitingEntry) {
                console.log("Found waiting peer data for PIN:", webcInit.pin, waitingEntry.peerData);
                clearTimeout(waitingEntry.cleanupTimer);
                udpConnection.addPeerDetails(waitingEntry.peerData.peerAddress, waitingEntry.peerData.peerPort);
                this.waitingPeerData.delete(webcInit.pin);
                return;
            }

            // If not, wait for peer data to arrive
            const timer = setTimeout(() => {
                if (!this.waitingForPeerData.has(webcInit.pin)) {
                    return;
                }
                const entry = this.waitingForPeerData.get(webcInit.pin);
                entry.connection.getReDatagram()?.close();
                this.waitingForPeerData.delete(webcInit.pin);
                reject(new Error("Timeout waiting for peer data"));
            }, 60000); // 60 seconds timeout
            this.waitingForPeerData.set(webcInit.pin, { connection: udpConnection, cleanupTimer: timer });
        });
    }

    async connect(candidate: PeerCandidate): Promise<GenericDataChannel> {
        console.log("Connecting to WebC peer:", candidate);
        const data = candidate.data as WebcInit;
        return this.setupConnection(data);
    }
    async getCandidates(fingerprint?: string): Promise<PeerCandidate[]> {
        if (!fingerprint) {
            return [];
        }
        const localSc = modules.getLocalServiceController();
        const webcInit = await localSc.account.requestWebcInit(fingerprint);

        return [{
            connectionType: ConnectionType.WEB,
            fingerprint,
            data: {
                fingerprint,
                serverAddress: webcInit.serverAddress,
                serverPort: webcInit.serverPort,
                pin: webcInit.pin,
            } as WebcInit,
        }];
    }

    createDataChannel(reDgram: ReDatagram): GenericDataChannel {
        console.log("Creating data channel");
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

    private waitingPeerData = new Map<string, { peerData: WebcPeerData, cleanupTimer: number }>();

    async start(): Promise<void> {
        const localSc = modules.getLocalServiceController();
        localSc.account.webcInitSignal.add(async (webcInit: WebcInit) => {
            try {
                const dataChannel = await this.setupConnection(webcInit);
                if (this.onIncomingConnectionCallback) {
                    this.onIncomingConnectionCallback(dataChannel);
                }
            } catch (err) {
                console.error("Failed to establish incoming WebC connection:", err);
            }
        });

        localSc.account.webcPeerDataSignal.add(async (webcPeerData: WebcPeerData) => {
            const waitingEntry = this.waitingForPeerData.get(webcPeerData.pin);
            if (waitingEntry) {
                clearTimeout(waitingEntry.cleanupTimer);
                waitingEntry.connection.addPeerDetails(webcPeerData.peerAddress, webcPeerData.peerPort);
                this.waitingForPeerData.delete(webcPeerData.pin);
            } else {
                console.warn("Received WebC peer data before server handshake for PIN:", webcPeerData.pin);
                const cleanupTimer = setTimeout(() => {
                    this.waitingPeerData.delete(webcPeerData.pin);
                }, 2 * 60000); // 2 minutes timeout
                this.waitingPeerData.set(webcPeerData.pin, { peerData: webcPeerData, cleanupTimer });
            }
        });
    }
    async stop(): Promise<void> {
    }
}
