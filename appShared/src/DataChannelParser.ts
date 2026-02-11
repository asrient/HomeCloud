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
        if (data.length === 0) {
            return; // Skip empty data
        }
        
        // Check buffer size limits to prevent memory exhaustion
        if (this.buffer.length + data.length > MAX_BUFFER_SIZE) {
            throw new Error(`Buffer size would exceed maximum (${MAX_BUFFER_SIZE} bytes)`);
        }
        
        // Concatenate incoming data
        const newBuffer = new Uint8Array(this.buffer.length + data.length);
        newBuffer.set(this.buffer);
        newBuffer.set(data, this.buffer.length);
        this.buffer = newBuffer;

        while (true) {
            if (this.buffer.length < HEADER_SIZE) {
                // Not enough for a header yet
                return;
            }

            const type = this.buffer[0];
            const flags = this.buffer[1];
            
            // Use DataView to properly handle 32-bit unsigned integer
            const payloadLength = new DataView(this.buffer.buffer, this.buffer.byteOffset + 2, 4).getUint32(0, false); // big-endian
            
            // Validate payload length
            if (payloadLength > MAX_PAYLOAD_SIZE) {
                throw new Error(`Payload size exceeds maximum (${payloadLength} > ${MAX_PAYLOAD_SIZE})`);
            }

            if (this.buffer.length < HEADER_SIZE + payloadLength) {
                // Wait for more data
                return;
            }

            // Validate type and flags ranges
            if (type > 255 || flags > 255) {
                throw new Error(`Invalid type (${type}) or flags (${flags})`);
            }

            // Use slice() to create independent copy for safe passing to other functions
            const payload = this.buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLength);
            this.opts.onFrame({ type, flags, payload });

            // Consume parsed frame - use slice() to create new independent buffer
            this.buffer = this.buffer.slice(HEADER_SIZE + payloadLength);
        }
    }

    public static encode(type: number, flags: number, payload: Uint8Array): Uint8Array {
        // Validate inputs
        if (type < 0 || type > 255) {
            throw new Error(`Invalid type: ${type} (must be 0-255)`);
        }
        if (flags < 0 || flags > 255) {
            throw new Error(`Invalid flags: ${flags} (must be 0-255)`);
        }
        if (payload.length > MAX_PAYLOAD_SIZE) {
            throw new Error(`Payload too large: ${payload.length} > ${MAX_PAYLOAD_SIZE}`);
        }
        
        const buf = new Uint8Array(HEADER_SIZE + payload.length);
        buf[0] = type;
        buf[1] = flags;
        
        // Use DataView for consistent big-endian encoding
        new DataView(buf.buffer).setUint32(2, payload.length, false); // false = big-endian
        
        buf.set(payload, HEADER_SIZE);
        return buf;
    }
}
