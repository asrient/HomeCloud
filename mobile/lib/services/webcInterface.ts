import { WebcInterface } from "shared/webcInterface";
import { DatagramCompat } from "shared/compat";
import SupermanModule from "../../modules/superman";

class Datagram_ extends DatagramCompat {
    private socketId: string | null = null;
    private isListening = false;

    constructor() {
        super();
        this.setupEventListeners();
    }

    private setupEventListeners() {
        SupermanModule.addListener('udpMessage', (params: { socketId: string; data: Uint8Array; address: string; port: number }) => {
            if (params.socketId === this.socketId && this.onMessage) {
                this.onMessage(params.data, {
                    address: params.address,
                    family: 'IPv4',
                    port: params.port
                });
            }
        });

        SupermanModule.addListener('udpError', (params: { socketId: string; error: string }) => {
            if (params.socketId === this.socketId && this.onError) {
                this.onError(new Error(params.error));
            }
        });

        SupermanModule.addListener('udpListening', (params: { socketId: string; address: string; port: number }) => {
            if (params.socketId === this.socketId) {
                this.isListening = true;
                if (this.onListen) {
                    this.onListen();
                }
            }
        });

        SupermanModule.addListener('udpClose', (params: { socketId: string }) => {
            if (params.socketId === this.socketId) {
                this.isListening = false;
                this.socketId = null;
                if (this.onClose) {
                    this.onClose();
                }
            }
        });
    }

    async bind(port?: number, address?: string): Promise<void> {
        try {
            // Create socket if not already created
            if (!this.socketId) {
                this.socketId = await SupermanModule.udpCreateSocket();
            }

            // Bind the socket
            const result = await SupermanModule.udpBind(this.socketId, port, address);
            this.boundAddress = result.address;
            this.boundPort = result.port;
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

    send(data: Uint8Array, port: number, address: string): void {
        if (!this.socketId) {
            throw new Error('Socket not created. Call bind() first.');
        }

        // Fire and forget - no await since interface expects void return
        SupermanModule.udpSend(this.socketId, data, port, address).catch(error => {
            if (this.onError) {
                this.onError(new Error(`Failed to send UDP data: ${error}`));
            }
        });
    }

    close(): void {
        if (this.socketId) {
            const socketId = this.socketId;
            this.socketId = null;
            this.isListening = false;
            
            // Fire and forget - no await since interface expects void return
            SupermanModule.udpClose(socketId).catch(error => {
                console.warn(`Error closing UDP socket: ${error}`);
            });
        }
    }

    removeEventListeners() {
        SupermanModule.removeAllListeners('udpMessage');
        SupermanModule.removeAllListeners('udpError');
        SupermanModule.removeAllListeners('udpListening');
        SupermanModule.removeAllListeners('udpClose');
    }
}

export default class MobileWebcInterface extends WebcInterface {
    createDatagramSocket(): Datagram_ {
        return new Datagram_();
    }
}
