import { DatagramCompat } from "./compat";

const DEBUG_BENCHMARKS = true;

const HEADER_SIZE = 5; // 1 byte type + 4 bytes seq
const MAX_PACKET_SIZE = 1300;
const ACK_BATCH_SIZE = 32;
const RETRANSMIT_TIMEOUT = 700; // ms
const MAX_RETRANSMITS = 12;
const MAX_BUFFERED_PACKETS = 512;
const MAX_ACK_DELAY_MS = 50;
const PING_INTERVAL_MS = 10 * 1000;
const MAX_PING_DELAY_MS = 25 * 1000;
const MAX_SEND_WINDOW = 1024; // max unACKed packets in flight
const RETRANSMIT_SCAN_INTERVAL = 200; // ms - how often to scan for timed-out packets

// Flags
const FLAG_DATA = 0;
const FLAG_ACK = 1;
const FLAG_HELLO = 2;
const FLAG_HELLO_ACK = 3;
const FLAG_BYE = 4;
const FLAG_PING = 5;

const MAX_PACKET_PAYLOAD = MAX_PACKET_SIZE - HEADER_SIZE;

const STRICT_IP_CHECK = false;

export class ReDatagram {
    private socket: DatagramCompat;
    private remote: { address: string; port: number };
    private allowedAddresses: Set<string>;

    private sendSeq = 1;
    private recvSeq = 1;

    private sendWindow = new Map<number, { packet: Uint8Array; sentAt: number; attempts: number }>();
    private ackPending = 0;

    private retransmitScanId: number | null = null;

    private isReady = false;
    private isRemoteClosed = false;
    private isClosing = false;

    onMessage?: (data: Uint8Array) => void;
    onClose?: (err: Error | null) => void;
    private onReady?: (isSuccess: boolean) => void;

    private lastPingReceived = Date.now();

    private sendQueue: Promise<void> = Promise.resolve();

    // Flow control: resolve callbacks waiting for window space
    private windowWaiters: (() => void)[] = [];

    // Benchmarking
    private bytesSent = 0;
    private bytesReceived = 0;
    private retransmitCount = 0;
    private statsLastBytesSent = 0;
    private statsLastBytesReceived = 0;
    private statsLastRetransmits = 0;
    private statsIntervalId: number | null = null;
    private statsLastTime = Date.now();

    constructor(socket: DatagramCompat, peerAddresses: string[], port: number, onReady?: (isSuccess: boolean) => void) {
        this.socket = socket;

        this.onReady = onReady;
        this.remote = { address: peerAddresses[0], port };
        this.allowedAddresses = new Set(peerAddresses);

        this.socket.onMessage = (msg, rinfo) => {
            // always verify port matches
            if (rinfo.port !== this.remote.port) {
                console.warn(`[ReUDP] Ignoring packet from unexpected port ${rinfo.address}:${rinfo.port}, expected port ${this.remote.port}`);
                return;
            }
            // make sure message is from an allowed remote address
            if (STRICT_IP_CHECK && !this.allowedAddresses.has(rinfo.address)) {
                console.warn(`[ReUDP] Ignoring packet from unexpected remote ${rinfo.address}:${rinfo.port}, not in allowed addresses`);
                return;
            }
            // Update remote address if it changed to an allowed one
            if (rinfo.address !== this.remote.address && this.allowedAddresses.has(rinfo.address)) {
                console.log(`[ReUDP] Remote address changed from ${this.remote.address} to ${rinfo.address}`);
                this.remote.address = rinfo.address;
            }
            this.handlePacket(msg);
        };

        this.socket.onError = (err) => {
            if (this.isClosing) {
                this.isRemoteClosed = true;
            } else {
                // Socket errors are common during app background/foreground, use warn level
                console.warn('[ReUDP] Socket error:', err.message || err);
                this.close();
            }
        };

        this.socket.onClose = () => {
            this.cleanup();
            if (this.isClosing) this.onClose?.(null);
        };

        this.sendHello();
        this.startPingLoop();
        this.startRetransmitLoop();
        if (DEBUG_BENCHMARKS) this.startStatsLoop();
    }

    private startRetransmitLoop() {
        this.retransmitScanId = setInterval(() => {
            if (this.isClosing) return;
            const now = Date.now();
            for (const [seq, entry] of this.sendWindow) {
                if (now - entry.sentAt < RETRANSMIT_TIMEOUT) continue;
                if (entry.attempts >= MAX_RETRANSMITS) {
                    console.error(`[ReUDP] Max retransmits reached for seq=${seq}, closing`);
                    this.sendWindow.delete(seq);
                    this.close();
                    return;
                }
                if (DEBUG_BENCHMARKS) console.warn(`Retransmitting seq=${seq}`);
                this.retransmitCount++;
                entry.attempts++;
                entry.sentAt = now;
                this.socket.send(entry.packet, this.remote.port, this.remote.address).catch(() => { });
            }
        }, RETRANSMIT_SCAN_INTERVAL);
    }

    private startStatsLoop() {
        this.statsLastTime = Date.now();
        this.statsIntervalId = setInterval(() => {
            const now = Date.now();
            const dt = (now - this.statsLastTime) / 1000;
            const sentDelta = this.bytesSent - this.statsLastBytesSent;
            const recvDelta = this.bytesReceived - this.statsLastBytesReceived;
            const retxDelta = this.retransmitCount - this.statsLastRetransmits;
            // Only log when there's meaningful data activity (ignore pings/keepalives)
            if (sentDelta > 1024 || recvDelta > 1024) {
                const sendRate = ((sentDelta / dt) / 1024).toFixed(1);
                const recvRate = ((recvDelta / dt) / 1024).toFixed(1);
                console.log(`[ReUDP Stats] TX: ${sendRate} KB/s (${(this.bytesSent / 1024).toFixed(0)} KB total) | RX: ${recvRate} KB/s (${(this.bytesReceived / 1024).toFixed(0)} KB total) | Window: ${this.sendWindow.size}/${MAX_SEND_WINDOW} | Retransmits: ${retxDelta} (${this.retransmitCount} total)`);
            }
            this.statsLastBytesSent = this.bytesSent;
            this.statsLastBytesReceived = this.bytesReceived;
            this.statsLastRetransmits = this.retransmitCount;
            this.statsLastTime = now;
        }, 5000);
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
        if (this.isReady || this.isClosing) return;
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

    private ping() {
        if (this.isClosing) return;
        const header = this.encodeHeader(FLAG_PING, 0);
        this.socket.send(header, this.remote.port, this.remote.address).catch(() => { });
    }

    async send(data: Uint8Array) {
        if (this.isClosing) {
            console.warn('[ReUDP] Attempting to send after close');
            return;
        }
        if (data.length === 0) {
            console.warn('[ReUDP] Attempting to send empty data');
            return;
        }

        const task = this.sendQueue.then(() => this.sendData(data));
        this.sendQueue = task.catch((e) => {
            console.log('[ReUDP] Send failed in queue:', e?.message || e);
        });
        await task;
    }

    private async sendData(data: Uint8Array) {
        let offset = 0;
        while (offset < data.length) {
            const chunkSize = Math.min(MAX_PACKET_PAYLOAD, data.length - offset);
            const chunk = data.slice(offset, offset + chunkSize);

            await this.sendPacket(chunk);
            offset += chunkSize;
        }
    }

    private async waitForWindowSpace() {
        while (this.sendWindow.size >= MAX_SEND_WINDOW && !this.isClosing) {
            await new Promise<void>(resolve => {
                this.windowWaiters.push(resolve);
            });
        }
    }

    private wakeWindowWaiters() {
        if (this.windowWaiters.length > 0 && this.sendWindow.size < MAX_SEND_WINDOW) {
            const waiter = this.windowWaiters.shift()!;
            waiter();
        }
    }

    private async sendPacket(data: Uint8Array) {
        if (this.isClosing) return;
        if (data.length > MAX_PACKET_PAYLOAD) {
            throw new Error(`Packet payload too large: ${data.length} > ${MAX_PACKET_PAYLOAD}`);
        }

        // Flow control: wait if send window is full
        await this.waitForWindowSpace();
        if (this.isClosing) return;

        const seq = this.sendSeq;
        this.sendSeq = this.sendSeq + 1;

        const header = this.encodeHeader(FLAG_DATA, seq);
        const packet = new Uint8Array(header.length + data.length);
        packet.set(header);
        packet.set(data, header.length);

        // Track in window before sending — retransmit scan handles failures
        this.sendWindow.set(seq, { packet, sentAt: Date.now(), attempts: 1 });

        this.bytesSent += data.length;

        // Fire-and-forget: don't await socket.send to allow burst sending.
        // The send window provides flow control; the kernel UDP buffer handles queueing.
        this.socket.send(packet, this.remote.port, this.remote.address).catch((error) => {
            if (!this.isClosing) {
                console.error(`[ReUDP] Failed to send packet seq=${seq}:`, error);
            }
        });
    }

    // Retransmit logic is handled by startRetransmitLoop() periodic scan

    private reorderBuffer = new Map<number, Uint8Array>();

    private ackDelayTimeout: number | null = null;

    private sendPendingAcks() {
        if (this.isClosing) return;
        if (this.ackPending > 0) {
            this.sendAck(this.recvSeq - 1);
            this.ackPending = 0;
        }
        this.ackDelayTimeout = null;
    }

    private handleDataPacket(seq: number, payload: Uint8Array) {
        if (seq < 1 || seq > 0xFFFFFFFF) {
            console.warn(`[ReUDP] Invalid sequence number: ${seq}`);
            return;
        }

        if (seq === this.recvSeq) {
            this.recvSeq = this.recvSeq + 1;
            this.ackPending++;
            this.bytesReceived += payload.length;
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
                this.handleDataPacket(seq, payload);
            }
            else if (type === FLAG_ACK) {
                const nextAck = seq + 1;
                // Remove all cached packets from sendBase up to nextAck
                while (this.sendBase < nextAck) {
                    this.sendWindow.delete(this.sendBase);
                    this.sendBase++;
                }
                // ACK proves peer is alive
                this.lastPingReceived = Date.now();
                // Wake any senders waiting for window space
                this.wakeWindowWaiters();
            }
            else if (type === FLAG_HELLO) {
                console.log("[ReUDP] Received HELLO, sending HELLO_ACK");
                this.lastPingReceived = Date.now();
                const header = this.encodeHeader(FLAG_HELLO_ACK, 0);
                this.socket.send(header, this.remote.port, this.remote.address).catch(() => { });
            }
            else if (type === FLAG_HELLO_ACK) {
                console.log("[ReUDP] Received HELLO_ACK");
                this.lastPingReceived = Date.now();
                // this.markReady();
            }
            else if (type === FLAG_PING) {
                // console.log("[ReUDP] Received PING, sending PING back");
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

    private sendAck(seq: number) {
        if (this.isClosing) return;
        const header = this.encodeHeader(FLAG_ACK, seq);
        this.socket.send(header, this.remote.port, this.remote.address).catch(() => { });
    }

    private cleanup() {
        // Mark as closing to prevent further sends
        this.isClosing = true;
        // Wake all waiting senders so they can exit
        for (const w of this.windowWaiters) w();
        this.windowWaiters = [];
        // Cleanup all resources
        for (const t of [this.retransmitScanId, this.pingIntervalId, this.statsIntervalId]) {
            if (t) clearInterval(t);
        }
        this.retransmitScanId = null;
        this.pingIntervalId = null;
        this.statsIntervalId = null;
        this.sendWindow.clear();
        this.reorderBuffer.clear();
        if (this.onReady) {
            this.onReady(false);
            this.onReady = undefined;
        }
    }

    private markReady() {
        if (this.isReady) return;
        this.isReady = true;
        if (this.onReady) this.onReady(true);
        this.onReady = undefined;
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
