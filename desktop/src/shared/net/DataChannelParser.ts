export interface DataChannelParserOptions {
    onFrame: (frame: { type: number; flags: number; payload: Uint8Array }) => void;
}

export class DataChannelParser {
    private buffer = new Uint8Array(0);

    constructor(private opts: DataChannelParserOptions) { }

    public feed(data: Uint8Array) {
        // Concatenate incoming data
        const newBuffer = new Uint8Array(this.buffer.length + data.length);
        newBuffer.set(this.buffer);
        newBuffer.set(data, this.buffer.length);
        this.buffer = newBuffer;

        while (true) {
            if (this.buffer.length < 6) {
                // Not enough for a header yet
                return;
            }

            const type = this.buffer[0];
            const flags = this.buffer[1];
            const payloadLength = (this.buffer[2] << 24) | (this.buffer[3] << 16) | (this.buffer[4] << 8) | (this.buffer[5] << 0);

            if (this.buffer.length < 6 + payloadLength) {
                // Wait for more data
                return;
            }

            const payload = this.buffer.slice(6, 6 + payloadLength);
            this.opts.onFrame({ type, flags, payload });

            // Consume parsed frame
            this.buffer = this.buffer.slice(6 + payloadLength);
        }
    }

    public static encode(type: number, flags: number, payload: Uint8Array): Uint8Array {
        const buf = new Uint8Array(6 + payload.length);
        buf[0] = type;
        buf[1] = flags;
        buf[2] = (payload.length >>> 24) & 0xff;
        buf[3] = (payload.length >>> 16) & 0xff;
        buf[4] = (payload.length >>> 8) & 0xff;
        buf[5] = (payload.length >>> 0) & 0xff;
        buf.set(payload, 6);
        return buf;
    }
}
