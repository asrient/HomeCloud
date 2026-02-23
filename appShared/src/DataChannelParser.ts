const MAX_PAYLOAD_SIZE = 1024 * 1024 * 16; // 16MB max payload
const MAX_BUFFER_SIZE = 1024 * 1024 * 32; // 32MB max buffer
const HEADER_SIZE = 6;

export interface DataChannelParserOptions {
    onFrame: (frame: { type: number; flags: number; payload: Uint8Array }) => void;
}

export class DataChannelParser {
    private buffer = new Uint8Array(0);

    constructor(private opts: DataChannelParserOptions) { }

    public feed(data: Uint8Array) {
        if (data.length === 0) return;

        // Append incoming data — when buffer is empty just adopt the chunk directly
        if (this.buffer.length === 0) {
            this.buffer = new Uint8Array(data);
        } else {
            const newBuffer = new Uint8Array(this.buffer.length + data.length);
            newBuffer.set(this.buffer);
            newBuffer.set(data, this.buffer.length);
            this.buffer = newBuffer;
        }

        if (this.buffer.length > MAX_BUFFER_SIZE) {
            throw new Error(`Buffer size exceeds maximum (${MAX_BUFFER_SIZE} bytes)`);
        }

        // Parse all complete frames
        let offset = 0;
        while (offset + HEADER_SIZE <= this.buffer.length) {
            // Read big-endian uint32 payload length (avoids DataView allocation)
            const payloadLength = (
                (this.buffer[offset + 2] << 24) |
                (this.buffer[offset + 3] << 16) |
                (this.buffer[offset + 4] << 8) |
                this.buffer[offset + 5]
            ) >>> 0;

            if (payloadLength > MAX_PAYLOAD_SIZE) {
                throw new Error(`Payload size exceeds maximum (${payloadLength} > ${MAX_PAYLOAD_SIZE})`);
            }

            const frameSize = HEADER_SIZE + payloadLength;
            if (offset + frameSize > this.buffer.length) break;

            const type = this.buffer[offset];
            const flags = this.buffer[offset + 1];
            const payload = this.buffer.slice(offset + HEADER_SIZE, offset + frameSize);
            offset += frameSize;

            this.opts.onFrame({ type, flags, payload });
        }

        // Keep only unconsumed tail
        if (offset > 0) {
            this.buffer = offset < this.buffer.length
                ? this.buffer.slice(offset)
                : new Uint8Array(0);
        }
    }

    public static encode(type: number, flags: number, payload: Uint8Array): Uint8Array {
        if (payload.length > MAX_PAYLOAD_SIZE) {
            throw new Error(`Payload too large: ${payload.length} > ${MAX_PAYLOAD_SIZE}`);
        }

        const buf = new Uint8Array(HEADER_SIZE + payload.length);
        buf[0] = type;
        buf[1] = flags;
        new DataView(buf.buffer).setUint32(2, payload.length, false);
        buf.set(payload, HEADER_SIZE);
        return buf;
    }
}
