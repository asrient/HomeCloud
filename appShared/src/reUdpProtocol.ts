import { DatagramCompat } from "./compat";

const HEADER_SIZE = 5; // 1 byte type + 4 bytes seq
const MAX_PACKET_SIZE = 1200;
const ACK_BATCH_SIZE = 6;
const RETRANSMIT_TIMEOUT = 700; // ms
const MAX_RETRANSMITS = 20;
const MAX_BUFFERED_PACKETS = 256;
const MAX_ACK_DELAY_MS = 400;
const PING_INTERVAL_MS = 10 * 1000;
const MAX_PING_DELAY_MS = 30 * 1000;

// Flags
const FLAG_DATA = 0;
const FLAG_ACK = 1;
const FLAG_HELLO = 2;
const FLAG_HELLO_ACK = 3;
const FLAG_BYE = 4;
const FLAG_PING = 5;

const MAX_PACKET_PAYLOAD = MAX_PACKET_SIZE - HEADER_SIZE;


export class ReDatagram {
    private socket: DatagramCompat;
    private remote: { address: string; port: number };

    private sendSeq = 1;
    private recvSeq = 1;

    private sendWindow = new Map<number, Uint8Array>();
    private ackPending = 0;

    private retransmitTimers = new Map<number, number>();

    private isReady = false;
    private isRemoteClosed = false;
    private isClosing = false;

    onMessage?: (data: Uint8Array) => void;
    onClose?: (err: Error | null) => void;
    private onReady?: () => void;

    private lastPingReceived = Date.now();

    constructor(socket: DatagramCompat, address: string, port: number, onReady?: () => void) {
        this.socket = socket;

        this.onReady = onReady;
        this.remote = { address, port };

        this.socket.onMessage = (msg, rinfo) => {
            // make sure message is from the expected remote
            if (rinfo.address !== this.remote.address || rinfo.port !== this.remote.port) {
                console.warn(`[ReUDP] Ignoring packet from unexpected remote ${rinfo.address}:${rinfo.port}, expected ${this.remote.address}:${this.remote.port}`);
                return;
            }
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
        this.startPingLoop();
    }

    private pingIntervalId: number | null = null;

    private startPingLoop() {
        this.pingIntervalId = setInterval(() => {
            if (this.isClosing && this.pingIntervalId) {
                clearInterval(this.pingIntervalId);
                this.pingIntervalId = null;
                return;
            }
            if (Date.now() - this.lastPingReceived > MAX_PING_DELAY_MS) {
                console.warn('[ReUDP] No ping received from remote, closing connection.');
                this.close();
                return;
            }
            this.ping();
        }, PING_INTERVAL_MS);
    }

    private encodeHeader(type: number, seq: number): Uint8Array {
        if (type < 0 || type > 255) {
            throw new Error(`Invalid packet type: ${type}`);
        }
        // if (seq < 0 || seq > 0xFFFFFFFF) {
        //     throw new Error(`Invalid sequence number: ${seq}`);
        // }

        const buf = new Uint8Array(HEADER_SIZE);
        buf[0] = type;
        new DataView(buf.buffer).setUint32(1, seq, false); // false = big-endian
        return buf;
    }

    private decodeHeader(buf: Uint8Array): { type: number; seq: number } {
        if (buf.length < HEADER_SIZE) {
            throw new Error(`Invalid packet: too short (${buf.length} < ${HEADER_SIZE})`);
        }

        const view = new DataView(buf.buffer, buf.byteOffset, HEADER_SIZE);
        const type = view.getUint8(0);
        const seq = view.getUint32(1, false); // false = big-endian
        return { type, seq };
    }

    private async sendHello(attempt = 1) {
        if (this.isReady) return;
        if (attempt > MAX_RETRANSMITS) {
            this.onClose?.(new Error('Failed to establish connection: no HELLO_ACK received'));
            this.socket.close();
            return;
        }
        console.log(`[ReUDP] Sending HELLO (attempt ${attempt})`);
        const header = this.encodeHeader(FLAG_HELLO, 0);
        await this.socket.send(header, this.remote.port, this.remote.address);
        setTimeout(() => this.sendHello(attempt + 1), RETRANSMIT_TIMEOUT);
    }

    private async ping() {
        if (this.isClosing) return;
        const header = this.encodeHeader(FLAG_PING, 0);
        console.log("[ReUDP] Sending PING");
        await this.socket.send(header, this.remote.port, this.remote.address);
    }

    async send(data: Uint8Array) {
        if (data.length === 0) {
            console.warn('[ReUDP] Attempting to send empty data');
            return;
        }

        let offset = 0;
        while (offset < data.length) {
            const chunkSize = Math.min(MAX_PACKET_PAYLOAD, data.length - offset);
            const chunk = data.slice(offset, offset + chunkSize);

            await this.sendPacket(chunk);
            offset += chunkSize;
        }
    }

    private async sendPacket(data: Uint8Array) {
        if (data.length > MAX_PACKET_PAYLOAD) {
            throw new Error(`Packet payload too large: ${data.length} > ${MAX_PACKET_PAYLOAD}`);
        }

        const seq = this.sendSeq;
        this.sendSeq = this.sendSeq + 1;

        const header = this.encodeHeader(FLAG_DATA, seq);
        const packet = new Uint8Array(header.length + data.length);
        packet.set(header);
        packet.set(data, header.length);

        try {
            await this.socket.send(packet, this.remote.port, this.remote.address);
            this.sendWindow.set(seq, packet);

            // schedule retransmit
            const timer = setTimeout(() => this.retransmit(seq), RETRANSMIT_TIMEOUT);
            this.retransmitTimers.set(seq, timer);
        } catch (error) {
            console.error(`[ReUDP] Failed to send packet seq=${seq}:`, error);
            throw error;
        }
    }

    private async retransmit(seq: number, attempt = 1) {
        const pkt = this.sendWindow.get(seq);
        if (!pkt || !this.remote) return;
        console.warn(`Retransmitting seq=${seq}`);
        await this.socket.send(pkt, this.remote.port, this.remote.address);
        if (attempt >= MAX_RETRANSMITS) {
            console.error(`Max retransmits reached for seq=${seq}, giving up`);
            this.sendWindow.delete(seq);
            this.retransmitTimers.delete(seq);
            // close connection
            this.close();
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

    private async handleDataPacket(seq: number, payload: Uint8Array) {
        if (seq < 1 || seq > 0xFFFFFFFF) {
            console.warn(`[ReUDP] Invalid sequence number: ${seq}`);
            return;
        }

        if (seq === this.recvSeq) {
            this.recvSeq = this.recvSeq + 1;
            this.ackPending++;
            try {
                this.onMessage?.(payload);
                if (!this.onMessage) {
                    console.warn('[ReUDP] onMessage handler is not set');
                }
            } catch (error) {
                console.error('[ReUDP] Error in onMessage handler:', error);
            }

            // Schedule delayed ACK
            if (!this.ackDelayTimeout) {
                this.ackDelayTimeout = setTimeout(() => this.sendPendingAcks(), MAX_ACK_DELAY_MS);
            }
            // send ACKs every few packets
            if (this.ackPending >= ACK_BATCH_SIZE) {
                await this.sendAck(this.recvSeq - 1);
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

    private async handlePacket(buf: Uint8Array) {
        try {
            if (buf.length === 0) {
                console.warn('[ReUDP] Received empty packet, ignoring');
                return;
            }

            // if (buf.length < HEADER_SIZE) {
            //     console.warn(`[ReUDP] DATA packet too short: ${buf.length}`);
            //     return;
            // }

            const { type, seq } = this.decodeHeader(buf);
            this.markReady();
            if (type === FLAG_DATA) {
                const payload = new Uint8Array(buf.buffer, buf.byteOffset + HEADER_SIZE, buf.length - HEADER_SIZE);
                console.log(`[ReUDP] Received DATA seq=${seq}, size=${payload.length}`);
                await this.handleDataPacket(seq, payload);
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
                this.lastPingReceived = Date.now();
                const header = this.encodeHeader(FLAG_HELLO_ACK, 0);
                await this.socket.send(header, this.remote.port, this.remote.address);
            }
            else if (type === FLAG_HELLO_ACK) {
                console.log("[ReUDP] Received HELLO_ACK");
                this.lastPingReceived = Date.now();
                // this.markReady();
            }
            else if (type === FLAG_PING) {
                console.log("[ReUDP] Received PING, sending PING back");
                this.lastPingReceived = Date.now();
            }
            else if (type === FLAG_BYE) {
                console.log("[ReUDP] Received BYE from remote, closing connection.");
                this.isRemoteClosed = true;
                this.close();
            }
            else {
                console.warn(`[ReUDP] Unknown packet type: ${type}`);
            }
        } catch (error) {
            console.error('[ReUDP] Error handling packet:', error);
            // close connection on error
            this.close();
        }
    }

    private async sendAck(seq: number) {
        // console.log(`[ReUDP] Sending ACK for seq=${seq}`);
        const header = this.encodeHeader(FLAG_ACK, seq);
        await this.socket.send(header, this.remote.port, this.remote.address);
    }

    private cleanup() {
        // Cleanup all resources
        for (const t of this.retransmitTimers.values()) clearTimeout(t);
        this.sendWindow.clear();
        this.retransmitTimers.clear();
        this.reorderBuffer.clear();
        if (this.pingIntervalId) {
            clearInterval(this.pingIntervalId);
            this.pingIntervalId = null;
        }
    }

    private markReady() {
        if (this.isReady) return;
        this.isReady = true;
        if (this.onReady) this.onReady();
    }

    async close() {
        if (this.isClosing) return;
        this.isClosing = true;
        if (!this.isRemoteClosed && this.isReady) {
            // Try to notify remote for graceful close
            const header = this.encodeHeader(FLAG_BYE, 0);
            try {
                await this.socket.send(header, this.remote.port, this.remote.address);
            } catch (error) {
                console.warn('[ReUDP] Failed to send BYE packet:', error);
            }
        }
        this.cleanup();
        this.socket.close();
    }
}
