import { WebcInterface } from "shared/webcInterface";
import { DatagramCompat } from "shared/compat";
import SupermanModule from "../../modules/superman";

// Global registry of active sockets
const activeSockets = new Map<string, Datagram_>();
let listenersSetup = false;

// Setup global event listeners once
function setupGlobalListeners() {
    if (listenersSetup) return;
    listenersSetup = true;

    SupermanModule.addListener('udpMessage', (params: { socketId: string; data: Uint8Array; address: string; port: number }) => {
        console.log(`Received UDP message event: ${params.data.byteLength} bytes`);
        const socket = activeSockets.get(params.socketId);
        if (socket && socket.onMessage) {
            socket.onMessage(params.data, {
                address: params.address,
                family: 'IPv4',
                port: params.port
            });
        } else {
            console.warn(`No active socket found for socketId: ${params.socketId}`);
        }
    });

    SupermanModule.addListener('udpError', (params: { socketId: string; error: string }) => {
        const socket = activeSockets.get(params.socketId);
        if (socket && socket.onError) {
            socket.onError(new Error(params.error));
        }
    });

    SupermanModule.addListener('udpListening', (params: { socketId: string; address: string; port: number }) => {
        const socket = activeSockets.get(params.socketId);
        if (socket) {
            socket.setListening(true);
            if (socket.onListen) {
                socket.onListen();
            }
        }
    });

    SupermanModule.addListener('udpClose', (params: { socketId: string }) => {
        const socket = activeSockets.get(params.socketId);
        if (socket) {
            socket.handleClose();
        }
    });
}

class Datagram_ extends DatagramCompat {
    private socketId: string | null = null;
    private isListening = false;

    setListening(listening: boolean) {
        this.isListening = listening;
    }

    handleClose() {
        this.isListening = false;
        if (this.socketId) {
            activeSockets.delete(this.socketId);
            this.socketId = null;
        }
        if (this.onClose) {
            this.onClose();
        }
    }

    async bind(port?: number, address?: string): Promise<void> {
        try {
            // Create socket if not already created
            if (!this.socketId) {
                console.log("Creating UDP socket");
                this.socketId = await SupermanModule.udpCreateSocket();
                // Register this socket in the global registry
                activeSockets.set(this.socketId, this);
            }
            console.log(`Binding UDP socket (ID: ${this.socketId}) to ${address || '0.0.0.0'}:${port || 0}`);
            // Bind the socket
            const result = await SupermanModule.udpBind(this.socketId, port, address || '0.0.0.0');
            this.boundAddress = result.address;
            this.boundPort = result.port;
            console.log(`UDP socket bound to ${this.boundAddress}:${this.boundPort}`);
        } catch (error) {
            throw new Error(`Failed to bind UDP socket: ${error}`);
        }
    }

    private boundAddress: string = '0.0.0.0';
    private boundPort: number = 0;

    address(): {
        address: string;
        family: string;
        port: number;
    } {
        return {
            address: this.boundAddress,
            family: 'IPv4',
            port: this.boundPort
        };
    }

    async send(data: Uint8Array, port: number, address: string): Promise<void> {
        if (!this.socketId) {
            throw new Error('Socket not created. Call bind() first.');
        }

        try {
            console.log(`Sending UDP data to ${address}:${port}. Size: ${data.byteLength} bytes`);
            const resp = await SupermanModule.udpSend(this.socketId, data, port, address);
            if (!resp) {
                throw new Error('UDP send failed');
            }
        } catch (error) {
            if (this.onError) {
                this.onError(new Error(`Failed to send UDP data to remote ${address}:${port} - ${error}`));
            }
        }
    }

    close(): void {
        console.log("Closing UDP socket");
        if (this.socketId) {
            const socketId = this.socketId;
            activeSockets.delete(socketId);
            this.socketId = null;
            this.isListening = false;
            
            // Fire and forget - no await since interface expects void return
            SupermanModule.udpClose(socketId).catch(error => {
                console.warn(`Error closing UDP socket: ${error}`);
            });
        }
    }
}

export default class MobileWebcInterface extends WebcInterface {
    createDatagramSocket(): Datagram_ {
        return new Datagram_();
    }

    override async start(): Promise<void> {
        console.log("Starting MobileWebcInterface");
        setupGlobalListeners();
        await super.start();
    }
}
