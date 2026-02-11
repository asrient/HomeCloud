import { UDP_PORT } from "./config";
import dgram from 'dgram';
import { relayWebcPeerData } from "./lib";

export class UdpService {
    private static instance: UdpService;
    private socket?: dgram.Socket;

    private constructor() {
    }

    public static getInstance(): UdpService {
        if (!UdpService.instance) {
            UdpService.instance = new UdpService();
        }
        return UdpService.instance;
    }

    public async setup() {
        this.socket = dgram.createSocket('udp4');
        this.socket.on('error', (err) => {
            console.error('UDP socket error:', err);
        });
        this.socket.on('message', async (buffer, rinfo: dgram.RemoteInfo) => {
            const message = buffer.toString();
            console.log(`[UDP] ${rinfo.address}:${rinfo.port} - ${message.substring(0, 15)}`);
            if (message.startsWith("PIN=")) {
                const pin = message.substring(4);
                try {
                    await relayWebcPeerData(pin, rinfo.address, rinfo.port);
                    // send back an ack
                    const ackMsg = Buffer.from("PIN_ACK");
                    this.socket?.send(ackMsg, rinfo.port, rinfo.address);
                } catch (error) {
                    console.error('Error relaying WebC peer data:', error);
                    const errorMsg = Buffer.from(`ERROR=${(error as Error).message}`);
                    this.socket?.send(errorMsg, rinfo.port, rinfo.address);
                }
            } else {
                console.warn('Received unknown UDP message.');
            }
        });
        this.socket.bind(UDP_PORT, () => {
            console.log(`UDP socket listening on port ${UDP_PORT}`);
        });
    }
}

export default UdpService.getInstance();
