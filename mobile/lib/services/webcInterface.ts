import { WebcInterface } from "shared/webcInterface";
import { DatagramCompat } from "shared/compat";
import { filterValidBonjourIps } from "shared/utils";
import { getIpAddressAsync } from 'expo-network';
import SupermanModule from "../../modules/superman";

// Global registry of active sockets
const activeSockets = new Map<string, Datagram_>();
let listenersSetup = false;

// Setup global event listeners once
function setupGlobalListeners() {
    if (listenersSetup) return;
    listenersSetup = true;

    SupermanModule.addListener('udpMessageBatch', (params: { socketId: string; packets: { data: Uint8Array; address: string; port: number }[] }) => {
        const socket = activeSockets.get(params.socketId);
        if (socket && socket.onMessage) {
            for (const pkt of params.packets) {
                socket.onMessage(pkt.data, {
                    address: pkt.address,
                    family: 'IPv4',
                    port: pkt.port
                });
            }
        }
    });

    SupermanModule.addListener('udpError', (params: { socketId: string; error: string }) => {
        const socket = activeSockets.get(params.socketId);
        if (socket) {
            // Log the error - udpClose will follow and handle cleanup
            console.log(`[UDP] Socket ${params.socketId} error: ${params.error}`);
            if (socket.onError) {
                socket.onError(new Error(params.error));
            }
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

    protected override async getLocalAddresses(): Promise<string[]> {
        // Get address directly from expo-network — no dependency on LOCAL/TCP
        try {
            const ipAddr = await getIpAddressAsync();
            if (ipAddr && ipAddr !== '0.0.0.0') {
                const filtered = filterValidBonjourIps([ipAddr]);
                if (filtered.length > 0) return filtered;
            }
        } catch (err) {
            console.warn('[MobileWebcInterface] Failed to get IP from expo-network:', err);
        }
        // Fallback to base implementation (LOCAL interface)
        return super.getLocalAddresses();
    }

    override async start(): Promise<void> {
        console.log("Starting MobileWebcInterface");
        setupGlobalListeners();
        await super.start();
    }
}
