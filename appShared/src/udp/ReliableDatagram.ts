import { DatagramCompat } from "./compat";

const HEADER_SIZE = 5; // 1 byte type + 4 bytes seq
const FLAG_DATA = 0;
const FLAG_ACK = 1;
const MAX_PACKET_SIZE = 1200;
const ACK_BATCH_SIZE = 6;
const RETRANSMIT_TIMEOUT = 600; // ms
const MAX_RETRANSMITS = 5;
const MAX_BUFFERED_PACKETS = 256;

const MAX_PACKET_PAYLOAD = MAX_PACKET_SIZE - HEADER_SIZE;

/*
Note: The window size must be less than half the sequence space (W < MAX_SEQ / 2) to avoid ambiguity.
With a 16-bit sequence space (0-65535), the maximum window size is 32767.
We use a sliding window with selective ACKs and retransmissions.
*/

export class ReliableDatagram {
    private socket: DatagramCompat;
    private remote?: { address: string; port: number };

    private sendSeq = 0;
    private recvSeq = 0;

    private sendWindow = new Map<number, Uint8Array>();
    private ackPending = 0;

    private retransmitTimers = new Map<number, number>();

    onMessage?: (data: Uint8Array) => void;
    onError?: (err: Error) => void;
    onClose?: () => void;

    constructor(socket: DatagramCompat) {
        this.socket = socket;

        this.socket.onMessage = (msg, rinfo) => {
            if (!this.remote) this.remote = { address: rinfo.address, port: rinfo.port };
            this.handlePacket(msg);
        };

        this.socket.onError = (err) => {
            this.onError?.(err);
            this.cleanup();
        };

        this.socket.onClose = () => {
            this.cleanup();
        };
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
        if (!this.remote) throw new Error('Remote not set');

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

    private handleDataPacket(seq: number, payload: Uint8Array) {
        if (seq === this.recvSeq) {
            this.recvSeq = this.recvSeq + 1;
            this.ackPending++;
            this.onMessage?.(payload);
            // send ACKs every few packets
            if (this.ackPending >= ACK_BATCH_SIZE) {
                this.sendAck(this.recvSeq - 1);
                this.ackPending = 0;
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

    private sendBase = 0; // first un-ACKed sequence

    private handlePacket(buf: Uint8Array) {
        const { type, seq } = this.decodeHeader(buf);

        if (type === FLAG_DATA) {
            const payload = buf.subarray(HEADER_SIZE);
            this.handleDataPacket(seq, payload);
        }
        else if (type === FLAG_ACK) {
            const ackSeq = seq;
            const nextAck = ackSeq + 1;
            // Remove all cached packets from sendBase up to ackSeq
            while (this.sendBase < nextAck) {
                if (this.sendWindow.has(this.sendBase)) {
                    clearTimeout(this.retransmitTimers.get(this.sendBase));
                    this.retransmitTimers.delete(this.sendBase);
                    this.sendWindow.delete(this.sendBase);
                }
                this.sendBase++;
            }
        }
    }

    private sendAck(seq: number) {
        if (!this.remote) return;
        const header = this.encodeHeader(FLAG_ACK, seq);
        this.socket.send(header, this.remote.port, this.remote.address);
    }

    setRemote(address: string, port: number) {
        this.remote = { address, port };
    }

    private cleanup() {
        // Cleanup all resources
        for (const t of this.retransmitTimers.values()) clearTimeout(t);
        this.sendWindow.clear();
        this.retransmitTimers.clear();
        this.reorderBuffer.clear();
        this.sendSeq = 0;
        this.recvSeq = 0;
        this.ackPending = 0;
        this.sendBase = 0;
    }

    close() {
        this.cleanup();
        this.socket.close();
    }
}
