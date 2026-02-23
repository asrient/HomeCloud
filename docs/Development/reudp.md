# ReUDP Protocol

ReUDP (**Re**liable **UDP**) is HomeCloud's custom reliable, ordered transport layer built on top of raw UDP datagrams. It provides TCP-like reliability guarantees while retaining the low-latency, connectionless nature of UDP — critical for file transfers between Electron desktop and React Native mobile where the native bridge introduces non-trivial latency.

Implementation: `appShared/src/reUdpProtocol.ts` (`ReDatagram` class)

---

## Why not TCP?

TCP works well for most applications, but HomeCloud transfers files between peers on a LAN where:

1. **React Native bridge latency** — on mobile, every UDP packet crosses the JS ↔ native bridge (~1-5ms per crossing). TCP's kernel-level retransmit timers don't account for this, leading to spurious retransmits.
2. **No head-of-line blocking** — UDP lets us implement our own flow control tuned to the application's actual processing speed rather than TCP's generic congestion window.
3. **Single connection** — ReUDP multiplexes all RPC streams over one UDP socket pair, avoiding TCP connection overhead.

---

## Wire Format

### Packet Header (5 bytes)

All packets share the same 5-byte header:

```
 0                   1                   2                   3                   4
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|     Type      |                    Sequence Number (32-bit)                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

| Offset | Size    | Field              | Description                          |
|--------|---------|--------------------|--------------------------------------|
| 0      | 1 byte  | Type               | Packet type flag (see below)         |
| 1      | 4 bytes | Sequence Number    | 32-bit big-endian unsigned integer    |

### Packet Types

| Value | Name        | Description                              |
|-------|-------------|------------------------------------------|
| 0     | `DATA`      | Payload data packet                      |
| 1     | `ACK`       | Cumulative acknowledgment (+ optional SACK) |
| 2     | `HELLO`     | Connection initiation                    |
| 3     | `HELLO_ACK` | Connection initiation response           |
| 4     | `BYE`       | Graceful connection teardown             |
| 5     | `PING`      | Keepalive                                |

### DATA Packet

```
[Header (5 bytes)] [Payload (up to 1295 bytes)]
```

- Maximum packet size: **1300 bytes** (fits within typical MTU without fragmentation)
- Maximum payload: **1295 bytes** (1300 − 5 byte header)
- Sequence numbers start at **1** and increment by 1 for each DATA packet

### ACK Packet (Cumulative)

Basic ACK (no SACK):
```
[Header (5 bytes)]
```

The sequence number in the header represents the **cumulative ACK**: "I have received all DATA packets up to and including this sequence number."

### ACK Packet with SACK Blocks

When the receiver has out-of-order packets buffered, the ACK includes Selective Acknowledgment blocks:

```
[Header (5 bytes)] [SACK Count (1 byte)] [SACK Block 1 (8 bytes)] ... [SACK Block N (8 bytes)]
```

Each SACK block:
```
 0                   1                   2                   3                   4                   5                   6                   7
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Start Seq (32-bit BE)                    |                       End Seq (32-bit BE)                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

- **SACK Count**: number of SACK blocks (max 4)
- **Start Seq**: first sequence number in the contiguous block the receiver has
- **End Seq**: last sequence number in the contiguous block (inclusive)

Example: cumulative ACK = 50, SACK blocks = [(53, 55), (58, 60)] means:
- Receiver has packets 1–50 (cumulative)
- Receiver also has packets 53–55 and 58–60 (selective)
- Packets 51–52 and 56–57 are **missing** (the sender should retransmit these)

**Backward compatibility**: Old peers that don't understand SACK simply ignore the extra bytes beyond the 5-byte header. Old-format 5-byte ACKs are processed normally (no SACK data present).

### Control Packets (HELLO, HELLO_ACK, BYE, PING)

```
[Header (5 bytes)]
```

Sequence number is **0** for all control packets (unused).

---

## Connection Lifecycle

### Handshake (HELLO / HELLO_ACK)

```
  Peer A                          Peer B
    |                               |
    |--- HELLO (seq=0) ----------->|
    |                               |
    |<-- HELLO_ACK (seq=0) --------|
    |                               |
    |  (connection ready)           |  (connection ready on first packet from A)
```

1. Both peers create a `ReDatagram` and immediately start sending `HELLO` packets
2. `HELLO` is retransmitted every `INITIAL_RTO` (1200ms) up to `MAX_RETRANSMITS` (12) attempts
3. Upon receiving any valid packet (not just HELLO_ACK), the peer marks the connection as **ready** via `markReady()`
4. Once ready, `HELLO` retransmits stop

If no `HELLO_ACK` is received after 12 attempts (~14.4 seconds), the connection fails with an error.

### Data Transfer

Once the connection is ready, data flows via `send()` → fragmentation → DATA packets → ACKs.

### Keepalive (PING)

- Sent every **3 seconds** (`PING_INTERVAL_MS`)
- If no PING or ACK is received for **10 seconds** (`MAX_PING_DELAY_MS`), the connection is closed
- ACK packets also reset the ping timer (they prove the peer is alive)

### Teardown (BYE)

```
  Peer A                          Peer B
    |                               |
    |--- BYE (seq=0) ------------->|
    |                               |  (closes connection)
    |  (closes socket)             |
```

- `close()` sends a single BYE packet, then calls `cleanup()` and closes the socket
- If the remote already closed (`isRemoteClosed`), BYE is not sent
- BYE is best-effort (no retransmit); if it's lost, the remote will close via ping timeout

### Post-Idle RTO & Congestion Reset

After a period of inactivity (no data sent for `IDLE_THRESHOLD_MS` = **5 seconds**):

1. **RTT estimator resets** — SRTT, RTTVAR, and RTO are re-bootstrapped from the next measured RTT sample. This prevents stale RTO values from causing retransmit storms when transfers resume.
2. **Congestion state resets** — `cwnd` returns to `INITIAL_CWND` (10) and `ssthresh` returns to `MAX_SEND_WINDOW` (1024). Recovery mode is cleared. This follows RFC 7661 (cwnd validation) and prevents a stale, collapsed `ssthresh` from limiting the next transfer burst.

---

## Sending

### Fragmentation

The `send(data)` public API accepts arbitrarily large `Uint8Array` buffers. Internally:

1. `sendData()` splits the buffer into chunks of up to **1295 bytes** (`MAX_PACKET_PAYLOAD`)
2. Each chunk is passed to `sendPacket()` which:
   - Waits for send window space (back-pressure)
   - Assigns a monotonically increasing sequence number
   - Prepends the 5-byte header
   - Stores the packet in `sendWindow` for potential retransmission
   - Sends fire-and-forget (does not await `socket.send()`)

### Send Queue

Calls to `send()` are serialized via a promise chain (`sendQueue`). This ensures that multi-chunk messages are sent in order even when called concurrently.

### Flow Control (Send Window)

- **Hard ceiling**: 1024 packets (`MAX_SEND_WINDOW`)
- **Effective window**: `min(cwnd, MAX_SEND_WINDOW)` — the congestion window (`cwnd`) dynamically controls how many packets can be in flight (see [Congestion Control](#congestion-control-aimd) below)
- At 1295 bytes/packet, `MAX_SEND_WINDOW` allows up to **~1.3 MB** of data in flight
- When the window is full, `waitForWindowSpace()` suspends the sender via a `Promise`
- When ACKs arrive and free window space, `wakeWindowWaiters()` resumes the oldest waiting sender

---

## Receiving

### In-Order Delivery

The receiver maintains `recvSeq` — the next expected sequence number (starts at 1).

When a DATA packet arrives:

| Condition | Action |
|-----------|--------|
| `seq === recvSeq` | Accept: increment `recvSeq`, buffer payload for delivery |
| `seq > recvSeq` | Out-of-order: store in `reorderBuffer`, schedule SACK ACK |
| `seq < recvSeq` | Duplicate/old: silently ignore |

### Reorder Buffer

Out-of-order packets are stored in a `Map<number, Uint8Array>` with a capacity of **1024 packets** (`MAX_BUFFERED_PACKETS`). When the expected sequence arrives, contiguous buffered packets are drained inline:

```
recvSeq = 50, reorderBuffer has {51, 52, 53, 55}
Packet 50 arrives → accept 50, drain 51, 52, 53 → recvSeq = 54
(55 stays buffered, 54 is still missing)
```

The drain is iterative (not recursive) to avoid stack overflow with large reorder buffers.

### Batched Delivery (Coalescing)

Instead of calling `onMessage()` for each individual packet, the receiver collects all payloads received in one event-loop tick into `pendingPayloads[]` and flushes them in a single `onMessage()` call via `setTimeout(0)`:

1. First packet in a tick: copy payload, push to `pendingPayloads`, schedule `flushPendingPayloads()` via `setTimeout(0)`
2. Subsequent packets in the same tick: just push to `pendingPayloads`
3. On next tick: `flushPendingPayloads()` merges all payloads into a single `Uint8Array` and calls `onMessage()` once

**Why?** The consumer (`DataChannelParser.feed()`) can process one large buffer much more efficiently than many small ones. On mobile, each `onMessage` call may cross the JS bridge, so batching reduces bridge crossings by 10–100×.

Single-payload fast path: if only one packet arrived, it's passed directly without concatenation.

---

## Acknowledgments

### Cumulative ACK

ACKs carry the highest in-order sequence number received. A single ACK at seq=100 implicitly acknowledges all packets 1–100.

### ACK Batching

ACKs are not sent for every packet. Instead:

1. Every **32 packets** (`ACK_BATCH_SIZE`): send ACK immediately
2. Otherwise: start a **50ms** delayed ACK timer (`MAX_ACK_DELAY_MS`) — if more packets arrive before the timer fires, they're included in the cumulative ACK
3. When the timer fires, send ACK for whatever has been received so far

This reduces ACK traffic by up to 32×.

### ACK-First Design

ACKs are sent **before** data is processed (before `onMessage` handlers run). This is critical because `onMessage` may involve crypto, disk writes, or other blocking work. By ACK-ing first, the sender learns about delivery promptly even if the receiver is busy processing.

### SACK (Selective Acknowledgment)

When the receiver buffers out-of-order packets, it computes contiguous SACK blocks from the reorder buffer and appends them to ACK packets. Up to **4 blocks** (`MAX_SACK_BLOCKS`) are included.

SACK ACKs for out-of-order packets are **batched**: a `sackScheduled` flag ensures only one SACK ACK is sent per event-loop tick, even if many out-of-order packets arrive in the same tick.

---

## Retransmission

### Timer-Based Retransmit (Periodic Scan)

A `setInterval` runs every **200ms** (`RETRANSMIT_SCAN_INTERVAL`) and scans all entries in the send window:

```
for each (seq, entry) in sendWindow:
    if entry.sacked → skip (receiver already has it)
    compute effectiveRto = rto × 2^(attempts - 1)   // exponential backoff
    if now - entry.sentAt < effectiveRto → skip (not yet timed out)
    if entry.attempts >= MAX_RETRANSMITS → close connection
    onCongestionEvent()   // shrink cwnd (see Congestion Control)
    retransmit the packet
```

- **Rate limit**: max **64 retransmits per scan** (`MAX_RETRANSMITS_PER_SCAN`) to prevent flooding
- **Max attempts**: **12** (`MAX_RETRANSMITS`) before the connection is declared dead
- Each retransmit triggers `onCongestionEvent()` which reduces the congestion window (at most once per recovery phase)

### Fast Retransmit (SACK-Driven)

When an ACK with SACK blocks arrives, the sender can infer exactly which packets are missing:

```
cumulative ACK = 50, SACK block = [53, 55]
→ packets 51, 52 are missing (gap between cumulative ACK and first SACK block)
→ immediately retransmit 51, 52 without waiting for timeout
```

Fast retransmit only fires if the gap packets have been in flight for at least `MIN_RTO` (150ms), to avoid false positives from network reordering. Like timer-based retransmits, fast retransmits also trigger `onCongestionEvent()`.

### Exponential Backoff

Each packet's retransmit timeout doubles with each attempt:

| Attempt | Effective Timeout (LAN, rto ≈ 150ms) | Effective Timeout (mobile bridge, rto ≈ 400ms) |
|---------|---------------------------------------|--------------------------------------------------|
| 1       | 150ms                                 | 400ms                                            |
| 2       | 300ms                                 | 800ms                                            |
| 3       | 600ms                                 | 1600ms                                           |
| 4       | 1200ms                                | 3200ms                                           |
| ...     | ...                                   | ... (capped at 8000ms)                           |

This prevents repeated storms if the network is congested or the peer is temporarily unresponsive.

---

## Adaptive RTO (Jacobson's Algorithm)

The retransmission timeout adapts to actual network conditions using the algorithm from RFC 6298:

### RTT Measurement

- **Karn's algorithm**: RTT is only measured from **first-attempt packets** (packets that haven't been retransmitted). For retransmitted packets, you can't determine which attempt was ACKed, so the measurement would be ambiguous.
- **One sample per ACK**: Only the **highest-sequence** first-attempt packet in each ACK range is measured. In burst sends, earlier packets in the burst appear to have longer RTT than they actually do (they were sent earlier but ACKed together). Taking all samples would inflate SRTT.

### RTO Computation

```
First RTT sample:
    SRTT = sample
    RTTVAR = sample / 2

Subsequent samples:
    RTTVAR = 0.75 × RTTVAR + 0.25 × |SRTT - sample|
    SRTT = 0.875 × SRTT + 0.125 × sample

RTO = clamp(SRTT + 4 × RTTVAR, MIN_RTO, MAX_RTO)
    = clamp(SRTT + 4 × RTTVAR, 150ms, 8000ms)
```

- **α = 1/8** (SRTT smoothing factor)
- **β = 1/4** (RTTVAR smoothing factor)
- On LAN: RTO converges to ~150ms (the floor)
- Over mobile bridge: RTO adapts to ~400–800ms depending on bridge latency

### Initial State

Before any RTT sample is collected, RTO defaults to **1200ms** (`INITIAL_RTO`). This is deliberately conservative to handle the "cold start" scenario where the mobile bridge or WiFi may be waking up.

---

## Congestion Control (AIMD)

ReUDP implements Additive-Increase / Multiplicative-Decrease (AIMD) congestion control with QUIC-style single-loss recovery. This prevents retransmit storms during burst sends by dynamically adjusting the sending rate.

### Congestion Window (`cwnd`)

The congestion window limits how many unACKed packets can be in flight:

```
effectiveWindow = min(floor(cwnd), MAX_SEND_WINDOW)
```

- **Initial value**: `INITIAL_CWND` = 10 packets (~13 KB)
- **Maximum**: `MAX_SEND_WINDOW` = 1024 packets (~1.3 MB)
- **Minimum**: `MIN_CWND` = 2 packets

### Slow Start

When `cwnd < ssthresh`, the window grows exponentially — one packet per ACKed packet:

```
cwnd += ackedCount
```

Starting from 10, slow start doubles the window each RTT. On a LAN with ~20ms RTT, cwnd reaches 640 in ~6 RTTs (~120ms).

### Congestion Avoidance

When `cwnd >= ssthresh`, the window grows linearly — approximately one packet per RTT:

```
cwnd += ackedCount / cwnd
```

### Loss Response (`onCongestionEvent`)

When a packet loss is detected (timer-based or fast retransmit):

```
ssthresh = max(floor(cwnd × 0.7), MIN_CWND)    // β = 0.7 (CUBIC-style)
cwnd = ssthresh
enter recovery mode
```

**β = 0.7** (vs TCP's 0.5) retains more window after loss, allowing faster recovery on LAN where losses are typically transient rather than congestion-induced.

### QUIC-Style Recovery Phase

To prevent repeated window halvings from a single loss event:

1. On loss detection, `recoverySeq` is set to the highest sent sequence number
2. `recoveryUntil` is set to `now + RTO` — a minimum recovery duration
3. While in recovery, additional losses do **not** trigger further cwnd reduction
4. Recovery exits only when:
   - All pre-loss packets are ACKed (`seq >= recoverySeq`), **AND**
   - The minimum recovery time has elapsed (`now >= recoveryUntil`)

The time guard prevents rapid exit → re-entry → repeated halvings when `sendSeq` barely moves (e.g., during RX-heavy periods with only small RPC responses being sent).

### Small-Window Guard

Congestion events are **ignored** when `sendWindow.size < INITIAL_CWND` (10). This prevents cwnd collapse during RX-heavy periods where only a few small RPC responses are in flight — those retransmits represent random loss or scheduling jitter, not congestion.

### Idle Reset

After 5 seconds of idle (`IDLE_THRESHOLD_MS`), cwnd and ssthresh reset to initial values (see [Post-Idle RTO & Congestion Reset](#post-idle-rto--congestion-reset)). This prevents a stale collapsed ssthresh from throttling the next transfer.

---

## Constants Reference

| Constant                   | Value    | Description                                    |
|----------------------------|----------|------------------------------------------------|
| `HEADER_SIZE`              | 5 bytes  | Packet header size                             |
| `MAX_PACKET_SIZE`          | 1300     | Maximum UDP packet size (fits typical MTU)     |
| `MAX_PACKET_PAYLOAD`       | 1295     | Maximum data payload per packet                |
| `MAX_SEND_WINDOW`          | 1024     | Hard ceiling for unACKed packets in flight     |
| `ACK_BATCH_SIZE`           | 32       | Send ACK every N packets                       |
| `MAX_ACK_DELAY_MS`         | 50ms     | Maximum delayed ACK wait time                  |
| `INITIAL_RTO`              | 1200ms   | Initial retransmission timeout                 |
| `MIN_RTO`                  | 150ms    | Minimum RTO (floor)                            |
| `MAX_RTO`                  | 8000ms   | Maximum RTO (ceiling)                          |
| `MAX_RETRANSMITS`          | 12       | Max retransmit attempts before connection death |
| `MAX_RETRANSMITS_PER_SCAN` | 64       | Max retransmits per 200ms scan cycle           |
| `RETRANSMIT_SCAN_INTERVAL` | 200ms    | How often the retransmit scanner runs          |
| `MAX_BUFFERED_PACKETS`     | 1024     | Max out-of-order packets in reorder buffer     |
| `MAX_SACK_BLOCKS`          | 4        | Max SACK blocks per ACK packet                 |
| `PING_INTERVAL_MS`         | 3,000ms  | Keepalive ping interval                        |
| `MAX_PING_DELAY_MS`        | 10,000ms | Connection timeout if no ping/ACK received     |
| `IDLE_THRESHOLD_MS`        | 5,000ms  | Idle duration before RTO/congestion resets      |
| `INITIAL_CWND`             | 10       | Initial congestion window (packets)            |
| `MIN_CWND`                 | 2        | Minimum congestion window (packets)            |

---

## Platform-Specific Behavior

### Desktop (Electron / Node.js)

- Uses Node.js `dgram` module via `Datagram_` wrapper
- Send/receive buffers set to **2 MB** each for high throughput
- All packet handling runs on the Node.js event loop (single-threaded)

### Mobile (React Native / Expo)

- Uses native UDP via the Superman Expo module:
  - **iOS**: `NWListener` / `NWConnection` (Network.framework) in `UdpNetworking.swift`
  - **Android**: Kotlin DatagramSocket
- Every packet crosses the JS ↔ native bridge, adding ~1-5ms latency per crossing
- Optimizations to reduce bridge crossings:
  - **Batched delivery**: coalesces multiple payloads into one `onMessage` call
  - **Batched SACK ACKs**: one SACK ACK per event-loop tick
  - **Cached connection fast-path** (iOS): sends bypass the serial dispatch queue when the connection is already ready
  - **Receive re-arm before dispatch** (iOS): the next `receiveMessage` is armed before the current packet is dispatched to JS

---

## Data Flow Diagram

```
Sender                                                          Receiver
  |                                                                |
  | send(largeBuffer)                                              |
  |   └→ sendData: split into 1295-byte chunks                    |
  |       └→ sendPacket (per chunk):                               |
  |           ├→ waitForWindowSpace (if window full, suspend)      |
  |           ├→ assign seq, prepend header                        |
  |           ├→ store in sendWindow                               |
  |           └→ socket.send (fire-and-forget)                     |
  |                                                                |
  | -------- [DATA seq=1 | payload] ---------------------------->  |
  | -------- [DATA seq=2 | payload] ---------------------------->  |
  | -------- [DATA seq=3 | payload] ------X (lost)                 |
  | -------- [DATA seq=4 | payload] ---------------------------->  |
  | -------- [DATA seq=5 | payload] ---------------------------->  |
  |                                                                |
  |                  handleDataPacket:                              |
  |                  seq 1: accept (recvSeq=1→2)                   |
  |                  seq 2: accept (recvSeq=2→3)                   |
  |                    → ACK sent (ackPending ≥ ACK_BATCH_SIZE     |
  |                      or delayed ACK timer fires)               |
  |                  seq 4: out-of-order, buffer in reorderBuffer  |
  |                    → schedule SACK ACK                         |
  |                  seq 5: out-of-order, buffer in reorderBuffer  |
  |                    → (SACK already scheduled this tick)        |
  |                                                                |
  | <--- [ACK seq=2 | SACK count=1 | (4,5)] ---------------------  |
  |                                                                |
  | handleACK:                                                     |
  |   cumulative ACK = 2 → delete seq 1,2 from sendWindow         |
  |   SACK block (4,5) → mark seq 4,5 as sacked                   |
  |   Fast retransmit: gap = [3] → retransmit seq 3               |
  |                                                                |
  | -------- [DATA seq=3 | payload] ---------------------------->  |
  |                                                                |
  |                  seq 3: accept (recvSeq=3→4)                   |
  |                  drain reorderBuffer: 4→5                      |
  |                  recvSeq = 6                                   |
  |                  → flushPendingPayloads() with merged buffer   |
  |                                                                |
  | <--- [ACK seq=5] -------------------------------------------   |
  |                                                                |
  | handleACK:                                                     |
  |   cumulative ACK = 5 → delete seq 3,4,5 from sendWindow       |
  |   wakeWindowWaiters (more space available)                     |
```
