import { DatagramCompat } from "./compat";
import { isLocalIp, isDebug, safeIp } from "./utils";

const HEADER_SIZE = 5; // 1 byte type + 4 bytes seq
const MAX_PACKET_SIZE = 1300;
const ACK_BATCH_SIZE = 64;
const MAX_BUFFERED_PACKETS = 1024;
const INITIAL_RTO = 1200;          // ms — initial RTO before any RTT measurement
const MIN_RTO = 150;               // ms — floor for adaptive RTO
const MAX_RTO = 2000;              // ms — ceiling for adaptive RTO
const MAX_RETRANSMITS_PER_SCAN = 64; // cap retransmits per scan to prevent storms
const MAX_SACK_BLOCKS = 4;         // max SACK blocks in ACK packets
const MAX_ACK_DELAY_MS = 50;
const IDLE_THRESHOLD_MS = 5000;    // reset RTT estimator after this much idle
const PING_INTERVAL_MS = 3 * 1000;
const MAX_PING_DELAY_MS = 10 * 1000;
const MAX_SEND_WINDOW = 1024; // max unACKed packets in flight
const RETRANSMIT_SCAN_INTERVAL = 200; // ms - how often to scan for timed-out packets
const HELLO_MAX_RETRIES = 10; // max HELLO retransmits before giving up (fixed, should not be profile-dependent)

// Congestion control (AIMD with QUIC-style recovery)
const INITIAL_CWND = 10;        // initial congestion window (packets)
const MIN_CWND = 2;             // minimum congestion window

const INITIAL_SSTHRESH = 128;   // initial slow-start threshold

// Network-profile–dependent parameters.
// LAN: gentle backoff (β=0.85) — bandwidth is abundant, losses are transient.
// WAN: standard backoff (β=0.7, CUBIC-style) — avoid buffer-bloat cascading.
interface NetworkProfile {
    beta: number;            // multiplicative decrease factor on loss
    maxRetransmits: number;  // per-packet retransmit limit before closing
}
const LAN_PROFILE: NetworkProfile = { beta: 0.85, maxRetransmits: 12 };
const WAN_PROFILE: NetworkProfile = { beta: 0.7, maxRetransmits: 16 };

// Flags
const FLAG_DATA = 0;
const FLAG_ACK = 1;
const FLAG_HELLO = 2;
const FLAG_HELLO_ACK = 3;
const FLAG_BYE = 4;
const FLAG_PING = 5;

const MAX_PACKET_PAYLOAD = MAX_PACKET_SIZE - HEADER_SIZE;

const STRICT_IP_CHECK = true;

export class ReDatagram {
    private socket: DatagramCompat;
    private remote: { address: string; port: number };
    private allowedAddresses: Set<string>;
    public tag: string;

    private sendSeq = 1;
    private recvSeq = 1;

    private sendWindow = new Map<number, { packet: Uint8Array; sentAt: number; attempts: number; sacked: boolean }>();
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

    // Adaptive RTO (Jacobson's algorithm, RFC 6298)
    private srtt = 0;
    private rttvar = 0;
    private rto = INITIAL_RTO;
    private rttMeasured = false;
    private minRtt = 0;                     // minimum observed RTT for sample clamping
    private lastDataActivity = Date.now();  // for idle detection

    // Congestion control (AIMD)
    private profile: NetworkProfile;
    private cwnd = INITIAL_CWND;
    private ssthresh: number;
    private recoverySeq = 0;             // highest seq when loss was detected
    private inRecovery = false;          // QUIC-style recovery phase
    private recoveryUntil = 0;           // minimum time before exiting recovery

    private statsLastBytesSent = 0;
    private statsLastBytesReceived = 0;
    private statsLastRetransmits = 0;
    private statsIntervalId: number | null = null;
    private statsLastTime = Date.now();

    constructor(socket: DatagramCompat, peerAddresses: string[], port: number, onReady?: (isSuccess: boolean) => void, tag?: string) {
        this.socket = socket;
        this.tag = tag || 'udp';

        // Detect LAN vs internet based on peer IP — tune congestion control accordingly.
        const isLan = peerAddresses.some(addr => isLocalIp(addr));
        this.profile = isLan ? LAN_PROFILE : WAN_PROFILE;
        this.ssthresh = INITIAL_SSTHRESH;
        console.debug(`[ReUDP:${this.tag}] Network profile: ${isLan ? 'LAN' : 'WAN'} (Beta=${this.profile.beta}, maxRetransmits=${this.profile.maxRetransmits})`);

        this.onReady = onReady;
        this.remote = { address: peerAddresses[0], port };
        this.allowedAddresses = new Set(peerAddresses);

        this.socket.onMessage = (msg, rinfo) => {
            // always verify port matches
            if (rinfo.port !== this.remote.port) {
                console.warn(`[ReUDP:${this.tag}] Ignoring packet from unexpected port.`);
                console.debug(`[ReUDP:${this.tag}] Expected address ${safeIp(this.remote.address)}:${this.remote.port}, got ${safeIp(rinfo.address)}:${rinfo.port}`);
                return;
            }
            // make sure message is from an allowed remote address
            if (STRICT_IP_CHECK && !this.allowedAddresses.has(rinfo.address)) {
                console.warn(`[ReUDP:${this.tag}] Ignoring packet from unexpected remote.`);
                console.debug(`[ReUDP:${this.tag}] Expected address ${safeIp(this.remote.address)}:${this.remote.port}, got ${safeIp(rinfo.address)}:${rinfo.port}`);
                return;
            }
            // Update remote address if it changed to an allowed one
            if (rinfo.address !== this.remote.address && this.allowedAddresses.has(rinfo.address)) {
                console.debug(`[ReUDP:${this.tag}] Remote address changed from ${safeIp(this.remote.address)}:${this.remote.port} to ${safeIp(rinfo.address)}:${rinfo.port}.`);
                this.remote.address = rinfo.address;
            }
            this.handlePacket(msg);
        };

        this.socket.onError = (err) => {
            if (this.isClosing) {
                this.isRemoteClosed = true;
            } else {
                // Socket errors are common during app background/foreground, use warn level
                console.warn(`[ReUDP:${this.tag}] Socket error:`, err.message || err);
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
        if (isDebug()) this.startStatsLoop();
    }

    private startRetransmitLoop() {
        this.retransmitScanId = setInterval(() => {
            if (this.isClosing) return;
            const now = Date.now();

            let retransmitsThisScan = 0;
            for (const [seq, entry] of this.sendWindow) {
                if (entry.sacked) continue; // Receiver already has this packet (SACK)
                // Per-packet exponential backoff: rto × 2^(attempts-1)
                const effectiveRto = Math.min(this.rto * Math.pow(2, Math.max(0, entry.attempts - 1)), MAX_RTO);
                if (now - entry.sentAt < effectiveRto) continue;
                if (entry.attempts >= this.profile.maxRetransmits) {
                    console.error(`[ReUDP:${this.tag}] Max retransmits reached for seq=${seq}, closing`);
                    this.sendWindow.delete(seq);
                    this.close();
                    return;
                }
                if (retransmitsThisScan >= MAX_RETRANSMITS_PER_SCAN) break; // Rate limit
                // Only trigger congestion event on 2nd+ timer retransmit.
                // First retransmit is often RTO jitter (especially on WiFi/mobile
                // where ACK spikes >MIN_RTO are common), not actual congestion.
                // SACK-driven fast retransmit handles reliable mid-stream loss detection.
                if (entry.attempts >= 2) this.onCongestionEvent();
                this.retransmitCount++;
                entry.attempts++;
                entry.sentAt = now;
                retransmitsThisScan++;
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
                const windowWaitInfo = this.windowWaitCount > 0 ? ` | WindowWait: ${this.windowWaitMs}ms (${this.windowWaitCount}×)` : '';
                console.debug(`[ReUDP:${this.tag}] [STATS] TX: ${sendRate} KB/s (${(this.bytesSent / 1024).toFixed(0)} KB total) | RX: ${recvRate} KB/s (${(this.bytesReceived / 1024).toFixed(0)} KB total) | Window: ${this.sendWindow.size}/${this.effectiveWindow()} | cwnd: ${Math.floor(this.cwnd)} ssthresh: ${this.ssthresh} | Retransmits: ${retxDelta} (${this.retransmitCount} total) | RTO: ${this.rto}ms SRTT: ${this.srtt.toFixed(0)}ms${windowWaitInfo}`);
                this.windowWaitMs = 0;
                this.windowWaitCount = 0;
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
                console.warn(`[ReUDP:${this.tag}] No ping received from remote, closing connection.`);
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
        if (attempt > HELLO_MAX_RETRIES) {
            this.onClose?.(new Error('Failed to establish connection: no HELLO_ACK received'));
            this.socket.close();
            return;
        }
        console.debug(`[ReUDP:${this.tag}] Sending HELLO (attempt ${attempt})`);
        const header = this.encodeHeader(FLAG_HELLO, 0);
        await this.socket.send(header, this.remote.port, this.remote.address);
        setTimeout(() => this.sendHello(attempt + 1), INITIAL_RTO);
    }

    private ping() {
        if (this.isClosing) return;
        const header = this.encodeHeader(FLAG_PING, 0);
        this.socket.send(header, this.remote.port, this.remote.address).catch(() => { });
    }

    private warnedSendAfterClose = false;

    async send(data: Uint8Array) {
        if (this.isClosing) {
            if (!this.warnedSendAfterClose) {
                this.warnedSendAfterClose = true;
                console.warn(`[ReUDP:${this.tag}] Attempting to send after close`);
            }
            return;
        }
        if (data.length === 0) {
            console.warn(`[ReUDP:${this.tag}] Attempting to send empty data`);
            return;
        }

        const task = this.sendQueue.then(() => this.sendData(data));
        this.sendQueue = task.catch((e) => {
            console.warn(`[ReUDP:${this.tag}] Send failed in queue:`, e?.message || e);
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

    private effectiveWindow() {
        return Math.min(Math.floor(this.cwnd), MAX_SEND_WINDOW);
    }

    // Track cumulative time spent waiting for window space (for diagnostics)
    private windowWaitMs = 0;
    private windowWaitCount = 0;

    private async waitForWindowSpace() {
        if (this.sendWindow.size < this.effectiveWindow()) return;
        const t0 = Date.now();
        while (this.sendWindow.size >= this.effectiveWindow() && !this.isClosing) {
            await new Promise<void>(resolve => {
                this.windowWaiters.push(resolve);
            });
        }
        this.windowWaitMs += Date.now() - t0;
        this.windowWaitCount++;
    }

    private wakeWindowWaiters() {
        if (this.windowWaiters.length > 0 && this.sendWindow.size < this.effectiveWindow()) {
            const waiter = this.windowWaiters.shift()!;
            waiter();
        }
    }

    /** Shrink cwnd on loss — only once per recovery phase (QUIC RFC 9002 §7). */
    private onCongestionEvent() {
        if (this.inRecovery) return; // already cut for this loss event
        // Don't react to loss when barely sending — a few RPC responses
        // retransmitting isn't congestion, it's random loss / scheduling jitter
        if (this.sendWindow.size < INITIAL_CWND) return;
        this.ssthresh = Math.max(Math.floor(this.cwnd * this.profile.beta), MIN_CWND);
        this.cwnd = this.ssthresh;
        this.inRecovery = true;
        this.recoverySeq = this.sendSeq - 1; // highest seq sent so far
        // Hold recovery for at least 1s to prevent rapid cut cascades.
        // Without this floor, recovery exits after ~150ms (one RTO), and
        // residual losses from the same burst trigger another cut immediately.
        // 1s gives time for the new lower cwnd to stabilize and for the
        // receiver to drain its buffers.
        this.recoveryUntil = Date.now() + Math.max(this.rto, 1000);
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
        this.sendWindow.set(seq, { packet, sentAt: Date.now(), attempts: 1, sacked: false });

        this.bytesSent += data.length;
        this.lastDataActivity = Date.now();

        // Fire-and-forget: don't await socket.send to allow burst sending.
        // The send window provides flow control; the kernel UDP buffer handles queueing.
        this.socket.send(packet, this.remote.port, this.remote.address).catch((error) => {
            if (!this.isClosing) {
                console.error(`[ReUDP:${this.tag}] Failed to send packet seq=${seq}:`, error);
            }
        });
    }

    // Retransmit logic is handled by startRetransmitLoop() periodic scan

    private reorderBuffer = new Map<number, Uint8Array>();

    private ackDelayTimeout: number | null = null;

    // Batched delivery: collect payloads during one event-loop tick,
    // then flush them all in a single onMessage call.
    private pendingPayloads: Uint8Array[] = [];
    private flushScheduled = false;
    private sackScheduled = false;

    private sendPendingAcks() {
        if (this.isClosing) return;
        if (this.ackPending > 0) {
            this.sendAck(this.recvSeq - 1);
            this.ackPending = 0;
        }
        this.ackDelayTimeout = null;
    }

    private flushPendingPayloads() {
        this.flushScheduled = false;
        if (this.isClosing || this.pendingPayloads.length === 0) return;

        const payloads = this.pendingPayloads;
        this.pendingPayloads = [];

        try {
            if (payloads.length === 1) {
                // Fast path: single payload, no concatenation needed
                this.onMessage?.(payloads[0]);
            } else {
                // Merge all payloads into one buffer so DataChannelParser.feed()
                // does a single pass instead of N separate feed() calls.
                let totalLength = 0;
                for (const p of payloads) totalLength += p.length;
                const merged = new Uint8Array(totalLength);
                let offset = 0;
                for (const p of payloads) {
                    merged.set(p, offset);
                    offset += p.length;
                }
                this.onMessage?.(merged);
            }
        } catch (error) {
            console.error(`[ReUDP:${this.tag}] Error in onMessage handler:`, error);
        }
    }

    private handleDataPacket(seq: number, payload: Uint8Array, alreadyCopied = false) {
        if (seq < 1 || seq > 0xFFFFFFFF) {
            console.warn(`[ReUDP:${this.tag}] Invalid sequence number: ${seq}`);
            return;
        }

        if (seq === this.recvSeq) {
            this.recvSeq = this.recvSeq + 1;
            this.ackPending++;
            this.bytesReceived += payload.length;

            // ACK immediately, then defer data processing to the next tick.
            // This lets the event loop drain the kernel UDP recv buffer and
            // send ACKs for the entire incoming batch before onMessage
            // handlers (disk writes, crypto, etc.) block the thread.
            if (this.ackPending >= ACK_BATCH_SIZE) {
                this.sendAck(this.recvSeq - 1);
                this.ackPending = 0;
                if (this.ackDelayTimeout) {
                    clearTimeout(this.ackDelayTimeout);
                    this.ackDelayTimeout = null;
                }
            } else if (!this.ackDelayTimeout) {
                this.ackDelayTimeout = setTimeout(() => this.sendPendingAcks(), MAX_ACK_DELAY_MS);
            }

            // Batch data delivery: copy the payload (it's a view into the
            // UDP recv buffer) and schedule a single flush for the next tick.
            // All packets received in this event-loop pass are coalesced into
            // one onMessage call, reducing timer + feed() overhead.
            // Payloads from reorderBuffer are already standalone copies.
            this.pendingPayloads.push(alreadyCopied ? payload : payload.slice());
            if (!this.flushScheduled) {
                this.flushScheduled = true;
                setTimeout(() => this.flushPendingPayloads(), 0);
            }

            // Drain contiguous buffered packets (already copied when buffered)
            while (this.reorderBuffer.has(this.recvSeq)) {
                const nextPayload = this.reorderBuffer.get(this.recvSeq)!;
                this.reorderBuffer.delete(this.recvSeq);
                this.recvSeq++;
                this.ackPending++;
                this.bytesReceived += nextPayload.length;
                this.pendingPayloads.push(nextPayload); // already copied

                if (this.ackPending >= ACK_BATCH_SIZE) {
                    this.sendAck(this.recvSeq - 1);
                    this.ackPending = 0;
                    if (this.ackDelayTimeout) {
                        clearTimeout(this.ackDelayTimeout);
                        this.ackDelayTimeout = null;
                    }
                }
            }
        }
        // Future packet: buffer it and schedule SACK ACK
        else if (this.recvSeq < seq && this.reorderBuffer.size < MAX_BUFFERED_PACKETS) {
            this.reorderBuffer.set(seq, alreadyCopied ? payload : payload.slice());
            // Batch SACK ACKs: schedule one per event-loop tick instead of one per packet
            if (!this.sackScheduled) {
                this.sackScheduled = true;
                setTimeout(() => {
                    this.sackScheduled = false;
                    if (!this.isClosing) this.sendAck(this.recvSeq - 1);
                }, 0);
            }
        } // else: old/duplicate packet, ignore
    }

    private sendBase = 1; // first un-ACKed sequence

    private handlePacket(buf: Uint8Array) {
        if (this.isClosing) return;
        try {
            if (buf.length === 0) {
                console.warn(`[ReUDP:${this.tag}] Received empty packet, ignoring`);
                return;
            }

            // if (buf.length < HEADER_SIZE) {
            //     console.warn(`[ReUDP:${this.tag}] DATA packet too short: ${buf.length}`);
            //     return;
            // }

            const { type, seq } = this.decodeHeader(buf);
            this.markReady();
            if (type === FLAG_DATA) {
                const payload = new Uint8Array(buf.buffer, buf.byteOffset + HEADER_SIZE, buf.length - HEADER_SIZE);
                this.handleDataPacket(seq, payload);
            }
            else if (type === FLAG_ACK) {
                const now = Date.now();
                const nextAck = seq + 1;
                // RTT measurement: use only the highest-seq first-attempt packet
                // in this ACK range (Karn's algorithm). Measuring all packets
                // in a burst inflates SRTT because earlier packets in the burst
                // appear to have longer RTT than they actually do.
                // Skip during recovery: fresh packets may sit in the receiver's
                // reorder buffer waiting for gap retransmits, producing inflated
                // RTT samples (seconds instead of ms) that contaminate SRTT.
                if (!this.inRecovery) {
                    for (let s = nextAck - 1; s >= this.sendBase; s--) {
                        const entry = this.sendWindow.get(s);
                        if (entry && entry.attempts === 1) {
                            this.updateRTT(now - entry.sentAt);
                            break; // one sample per ACK
                        }
                    }
                }
                // Remove all cached packets from sendBase up to nextAck
                const ackedCount = nextAck - this.sendBase;
                while (this.sendBase < nextAck) {
                    this.sendWindow.delete(this.sendBase);
                    this.sendBase++;
                }
                // Congestion window growth
                if (ackedCount > 0) {
                    if (this.cwnd < this.ssthresh) {
                        // Slow start: exponential growth (1 per ACKed packet)
                        this.cwnd = Math.min(this.cwnd + ackedCount, MAX_SEND_WINDOW);
                    } else {
                        // Congestion avoidance: linear growth (~1 per RTT)
                        this.cwnd = Math.min(this.cwnd + ackedCount / this.cwnd, MAX_SEND_WINDOW);
                    }
                    // Exit recovery when all pre-loss packets are ACKed
                    // AND minimum recovery time has elapsed (prevents rapid
                    // exit → re-entry → repeated halvings when sendSeq barely moves)
                    if (this.inRecovery && seq >= this.recoverySeq && Date.now() >= this.recoveryUntil) {
                        this.inRecovery = false;
                        // Restore SRTT from min_rtt baseline: during recovery,
                        // RTT measurement is paused and SRTT may be stale/inflated.
                        // Bootstrap from 2× min_rtt gives a clean starting point
                        // without waiting for a post-recovery sample (which may
                        // still be inflated from receiver queue draining).
                        if (this.minRtt > 0) {
                            this.srtt = this.minRtt * 2;
                            this.rttvar = this.minRtt;
                            this.rto = Math.max(MIN_RTO, Math.min(MAX_RTO, Math.round(this.srtt + 4 * this.rttvar)));
                        } else {
                            this.rttMeasured = false;
                            this.rto = INITIAL_RTO;
                        }
                    }
                }
                // Parse SACK blocks if present (beyond the 5-byte header)
                if (buf.length > HEADER_SIZE) {
                    const sackCount = Math.min(buf[HEADER_SIZE], MAX_SACK_BLOCKS);
                    const sackView = new DataView(buf.buffer, buf.byteOffset);
                    let firstSackStart = 0;
                    for (let i = 0; i < sackCount && HEADER_SIZE + 1 + i * 8 + 8 <= buf.length; i++) {
                        const sackStart = sackView.getUint32(HEADER_SIZE + 1 + i * 8, false);
                        const sackEnd = sackView.getUint32(HEADER_SIZE + 1 + i * 8 + 4, false);
                        if (i === 0) firstSackStart = sackStart;
                        // Mark SACKed entries — receiver already has these
                        for (let s = sackStart; s <= sackEnd && s - sackStart < MAX_SEND_WINDOW; s++) {
                            const e = this.sendWindow.get(s);
                            if (e) e.sacked = true;
                        }
                    }
                    // Fast retransmit: resend gap packets between cumulative ACK and first SACK block
                    if (sackCount > 0 && firstSackStart > this.sendBase) {
                        let fastRetx = 0;
                        for (let s = this.sendBase; s < firstSackStart && fastRetx < MAX_RETRANSMITS_PER_SCAN; s++) {
                            const gapEntry = this.sendWindow.get(s);
                            if (gapEntry && !gapEntry.sacked && now - gapEntry.sentAt >= MIN_RTO) {
                                if (gapEntry.attempts >= this.profile.maxRetransmits) {
                                    console.error(`[ReUDP:${this.tag}] Max retransmits (fast) for seq=${s}, closing`);
                                    this.close();
                                    return;
                                }
                                this.onCongestionEvent(); // shrink cwnd on SACK-driven loss
                                gapEntry.attempts++;
                                gapEntry.sentAt = now;
                                this.retransmitCount++;
                                fastRetx++;
                                this.socket.send(gapEntry.packet, this.remote.port, this.remote.address).catch(() => { });
                            }
                        }
                    }
                }
                // ACK proves peer is alive
                this.lastPingReceived = now;
                // Wake any senders waiting for window space
                this.wakeWindowWaiters();
            }
            else if (type === FLAG_HELLO) {
                console.debug("[ReUDP:${this.tag}] Received HELLO, sending HELLO_ACK");
                this.lastPingReceived = Date.now();
                const header = this.encodeHeader(FLAG_HELLO_ACK, 0);
                this.socket.send(header, this.remote.port, this.remote.address).catch(() => { });
            }
            else if (type === FLAG_HELLO_ACK) {
                console.debug("[ReUDP:${this.tag}] Received HELLO_ACK");
                this.lastPingReceived = Date.now();
                // this.markReady();
            }
            else if (type === FLAG_PING) {
                // console.log("[ReUDP:${this.tag}] Received PING, sending PING back");
                this.lastPingReceived = Date.now();
            }
            else if (type === FLAG_BYE) {
                console.log("[ReUDP:${this.tag}] Received BYE from remote, closing connection.");
                this.isRemoteClosed = true;
                this.close();
            }
            else {
                console.warn(`[ReUDP:${this.tag}] Unknown packet type: ${type}`);
            }
        } catch (error) {
            console.error(`[ReUDP:${this.tag}] Error handling packet:`, error);
            // close connection on error
            this.close();
        }
    }

    private updateRTT(sample: number) {
        const now = Date.now();
        const idleTime = now - this.lastDataActivity;
        this.lastDataActivity = now;

        // After idle periods, the event loop / native bridge may be cold,
        // inflating the first few RTT samples. Re-bootstrap the estimator
        // so stale SRTT doesn't get contaminated. (RFC 6298 §5.1 note)
        if (this.rttMeasured && idleTime > IDLE_THRESHOLD_MS) {
            this.rttMeasured = false;
            this.rto = INITIAL_RTO;
            this.minRtt = 0;
            // Reset congestion state after idle (RFC 7661 cwnd validation).
            // Keep ssthresh from prior loss events — it remembers the receiver's
            // capacity, preventing slow-start overshoot on subsequent bursts.
            this.cwnd = INITIAL_CWND;
            this.inRecovery = false;
        }

        // Track minimum RTT (before clamping) for outlier detection
        if (this.minRtt === 0 || sample < this.minRtt) {
            this.minRtt = sample;
        }

        // Clamp outlier samples: during/after congestion, even first-attempt
        // packets show inflated RTT from receiver-side queuing (reorder buffer
        // drains, native bridge contention, event loop delays). Without
        // clamping, SRTT climbs to 1-4s on LAN and stays there for minutes.
        // 8× min_rtt gives generous headroom for legitimate path variation;
        // 400ms floor prevents over-clamping on internet paths before min_rtt
        // has converged.
        if (this.minRtt > 0) {
            sample = Math.min(sample, Math.max(this.minRtt * 8, 400));
        }

        if (!this.rttMeasured) {
            // First measurement: bootstrap (RFC 6298 §2.2)
            this.srtt = sample;
            this.rttvar = sample / 2;
            this.rttMeasured = true;
        } else {
            // Jacobson's algorithm (RFC 6298 §2.3)
            this.rttvar = 0.75 * this.rttvar + 0.25 * Math.abs(this.srtt - sample);
            this.srtt = 0.875 * this.srtt + 0.125 * sample;
        }
        this.rto = Math.max(MIN_RTO, Math.min(MAX_RTO, Math.round(this.srtt + 4 * this.rttvar)));
    }

    private getSackBlocks(): [number, number][] {
        if (this.reorderBuffer.size === 0) return [];
        const seqs = Array.from(this.reorderBuffer.keys()).sort((a, b) => a - b);
        const blocks: [number, number][] = [];
        let start = seqs[0], end = seqs[0];
        for (let i = 1; i < seqs.length; i++) {
            if (seqs[i] === end + 1) {
                end = seqs[i];
            } else {
                blocks.push([start, end]);
                start = seqs[i];
                end = seqs[i];
            }
        }
        blocks.push([start, end]);
        return blocks.slice(0, MAX_SACK_BLOCKS);
    }

    private sendAck(seq: number) {
        if (this.isClosing) return;
        const header = this.encodeHeader(FLAG_ACK, seq);
        const sackBlocks = this.getSackBlocks();
        if (sackBlocks.length > 0) {
            // ACK with SACK: [header(5)] [count(1)] [start(4)+end(4)] × N
            const pkt = new Uint8Array(HEADER_SIZE + 1 + sackBlocks.length * 8);
            pkt.set(header);
            pkt[HEADER_SIZE] = sackBlocks.length;
            const view = new DataView(pkt.buffer);
            for (let i = 0; i < sackBlocks.length; i++) {
                view.setUint32(HEADER_SIZE + 1 + i * 8, sackBlocks[i][0], false);
                view.setUint32(HEADER_SIZE + 1 + i * 8 + 4, sackBlocks[i][1], false);
            }
            this.socket.send(pkt, this.remote.port, this.remote.address).catch(() => { });
        } else {
            this.socket.send(header, this.remote.port, this.remote.address).catch(() => { });
        }
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
        if (this.ackDelayTimeout) {
            clearTimeout(this.ackDelayTimeout);
            this.ackDelayTimeout = null;
        }
        this.sendWindow.clear();
        this.reorderBuffer.clear();
        this.pendingPayloads = [];
        this.flushScheduled = false;
        this.sackScheduled = false;
        this.onMessage = undefined;
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
                console.warn(`[ReUDP:${this.tag}] Failed to send BYE packet:`, error);
            }
        }
        this.cleanup();
        this.socket.close();
    }
}
