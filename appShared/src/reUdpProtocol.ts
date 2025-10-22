import { DatagramCompat } from "./compat";

const HEADER_SIZE = 5; // 1 byte type + 4 bytes seq
const MAX_PACKET_SIZE = 1200;
const ACK_BATCH_SIZE = 6;
const RETRANSMIT_TIMEOUT = 600; // ms
const MAX_RETRANSMITS = 8;
const MAX_BUFFERED_PACKETS = 256;
const MAX_ACK_DELAY_MS = 200;

// Flags
const FLAG_DATA = 0;
const FLAG_ACK = 1;
const FLAG_HELLO = 2;
const FLAG_HELLO_ACK = 3;
const FLAG_BYE = 4;

const MAX_PACKET_PAYLOAD = MAX_PACKET_SIZE - HEADER_SIZE;


export class ReDatagram {
    private socket: DatagramCompat;
    private remote: { address: string; port: number };

    private sendSeq = 1;
    private recvSeq = 1;

    private sendWindow = new Map<number, Uint8Array>();
    private ackPending = 0;

    private retransmitTimers = new Map<number, number>();

    private isMyHelloAcked = false;
    private isRemoteClosed = false;
    private isClosing = false;

    onMessage?: (data: Uint8Array) => void;
    onClose?: (err: Error | null) => void;
    private onReady?: () => void;

    constructor(socket: DatagramCompat, address: string, port: number, onReady?: () => void) {
        this.socket = socket;

        this.onReady = onReady;
        this.remote = { address, port };

        this.socket.onMessage = (msg, rinfo) => {
            if (!this.remote) this.remote = { address: rinfo.address, port: rinfo.port };
            this.handlePacket(msg);
        };

        this.socket.onError = (err) => {
            if (this.isClosing) {
                this.isRemoteClosed = true;
            } else {
                console.error('Socket error:', err);
                this.close();
            }
        };

        this.socket.onClose = () => {
            this.cleanup();
            if (this.isClosing) this.onClose?.(null);
        };

        this.sendHello();
    }

    private encodeHeader(type: number, seq: number): Uint8Array {
        const buf = new Uint8Array(HEADER_SIZE);
        buf[0] = type;
        new DataView(buf.buffer).setUint32(1, seq);
        return buf;
    }

    private decodeHeader(buf: Uint8Array): { type: number; seq: number } {
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        return {
            type: view.getUint8(0),
            seq: view.getUint32(1),
        };
    }

    private sendHello(attempt = 1) {
        if (this.isMyHelloAcked) return;
        if (attempt > MAX_RETRANSMITS) {
            this.onClose?.(new Error('Failed to establish connection: no HELLO_ACK received'));
            this.socket.close();
            return;
        }
        const header = this.encodeHeader(FLAG_HELLO, 0);
        this.socket.send(header, this.remote.port, this.remote.address);
        setTimeout(() => this.sendHello(attempt + 1), RETRANSMIT_TIMEOUT);
    }

    async send(data: Uint8Array) {
        let offset = 0;
        while (offset < data.length) {
            const chunkSize = Math.min(MAX_PACKET_PAYLOAD, data.length - offset);
            const chunk = data.subarray(offset, offset + chunkSize);

            await this.sendPacket(chunk);
            offset += chunkSize;
        }
    }

    private async sendPacket(data: Uint8Array) {
        const seq = this.sendSeq;
        this.sendSeq = this.sendSeq + 1;

        const header = this.encodeHeader(FLAG_DATA, seq);
        const packet = new Uint8Array(header.length + data.length);
        packet.set(header);
        packet.set(data, header.length);

        this.socket.send(packet, this.remote.port, this.remote.address);
        this.sendWindow.set(seq, packet);

        // schedule retransmit
        const timer = setTimeout(() => this.retransmit(seq), RETRANSMIT_TIMEOUT);
        this.retransmitTimers.set(seq, timer);
    }

    private retransmit(seq: number, attempt = 1) {
        const pkt = this.sendWindow.get(seq);
        if (!pkt || !this.remote) return;
        console.warn(`Retransmitting seq=${seq}`);
        this.socket.send(pkt, this.remote.port, this.remote.address);
        if (attempt >= MAX_RETRANSMITS) {
            console.error(`Max retransmits reached for seq=${seq}, giving up`);
            this.sendWindow.delete(seq);
            this.retransmitTimers.delete(seq);
            return;
        }
        const timer = setTimeout(() => this.retransmit(seq, attempt + 1), RETRANSMIT_TIMEOUT);
        this.retransmitTimers.set(seq, timer);
    }

    private reorderBuffer = new Map<number, Uint8Array>();

    private ackDelayTimeout: number | null = null;

    private sendPendingAcks() {
        if (this.ackPending > 0) {
            this.sendAck(this.recvSeq - 1);
            this.ackPending = 0;
        }
        this.ackDelayTimeout = null;
    }

    private handleDataPacket(seq: number, payload: Uint8Array) {
        if (seq === this.recvSeq) {
            this.recvSeq = this.recvSeq + 1;
            this.ackPending++;
            this.onMessage?.(payload);
            // Schedule delayed ACK
            if (!this.ackDelayTimeout) {
                this.ackDelayTimeout = setTimeout(() => this.sendPendingAcks(), MAX_ACK_DELAY_MS);
            }
            // send ACKs every few packets
            if (this.ackPending >= ACK_BATCH_SIZE) {
                this.sendAck(this.recvSeq - 1);
                this.ackPending = 0;
                if (this.ackDelayTimeout) {
                    clearTimeout(this.ackDelayTimeout);
                    this.ackDelayTimeout = null;
                }
            }
            // Process next contiguous buffered packet if available
            if (this.reorderBuffer.has(this.recvSeq)) {
                const nextPayload = this.reorderBuffer.get(this.recvSeq)!;
                this.reorderBuffer.delete(this.recvSeq);
                this.handleDataPacket(this.recvSeq, nextPayload);
            }
        }
        // Future packet, buffer it
        else if (this.recvSeq < seq && this.reorderBuffer.size < MAX_BUFFERED_PACKETS) {
            this.reorderBuffer.set(seq, payload);
        } // else: old packet, ignore
    }

    private sendBase = 1; // first un-ACKed sequence

    private handlePacket(buf: Uint8Array) {
        const { type, seq } = this.decodeHeader(buf);

        if (type === FLAG_DATA) {
            const payload = buf.subarray(HEADER_SIZE);
            console.log(`[ReUDP] Received DATA seq=${seq}, size=${payload.length}`);
            this.handleDataPacket(seq, payload);
        }
        else if (type === FLAG_ACK) {
            const nextAck = seq + 1;
            // Remove all cached packets from sendBase up to nextAck
            while (this.sendBase < nextAck) {
                if (this.sendWindow.has(this.sendBase)) {
                    clearTimeout(this.retransmitTimers.get(this.sendBase));
                    this.retransmitTimers.delete(this.sendBase);
                    this.sendWindow.delete(this.sendBase);
                }
                this.sendBase++;
            }
        }
        else if (type === FLAG_HELLO) {
            console.log("[ReUDP] Received HELLO, sending HELLO_ACK");
            const header = this.encodeHeader(FLAG_HELLO_ACK, 0);
            this.socket.send(header, this.remote.port, this.remote.address);
        }
        else if (type === FLAG_HELLO_ACK) {
            console.log("[ReUDP] Received HELLO_ACK");
            if (!this.isMyHelloAcked) {
                this.isMyHelloAcked = true;
                if (this.onReady) this.onReady();
            }
        }
        else if (type === FLAG_BYE) {
            console.log("[ReUDP] Received BYE from remote, closing connection.");
            this.isRemoteClosed = true;
            this.close();
        }
    }

    private sendAck(seq: number) {
        console.log(`[ReUDP] Sending ACK for seq=${seq}`);
        const header = this.encodeHeader(FLAG_ACK, seq);
        this.socket.send(header, this.remote.port, this.remote.address);
    }

    private cleanup() {
        // Cleanup all resources
        for (const t of this.retransmitTimers.values()) clearTimeout(t);
        this.sendWindow.clear();
        this.retransmitTimers.clear();
        this.reorderBuffer.clear();
    }

    private closeAttempt = 1;

    close() {
        if (this.isClosing && this.closeAttempt === 1) return;
        this.isClosing = true;
        if (!this.isRemoteClosed && this.closeAttempt <= MAX_RETRANSMITS && this.isMyHelloAcked) {
            // Try to notify remote for graceful close
            const header = this.encodeHeader(FLAG_BYE, 0);
            this.socket.send(header, this.remote.port, this.remote.address);
            setTimeout(() => this.close(), RETRANSMIT_TIMEOUT);
            return;
        }
        this.cleanup();
        this.socket.close();
    }
}
