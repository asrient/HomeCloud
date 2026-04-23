export class RingBuffer {
    private buf: Uint8Array;
    private head = 0;
    private size = 0;

    constructor(private capacity = 1024 * 1024) {
        this.buf = new Uint8Array(capacity);
    }

    enqueue(chunk: Uint8Array): void {
        if (chunk.length >= this.capacity) {
            // Chunk larger than buffer — keep only the tail
            this.buf.set(chunk.subarray(chunk.length - this.capacity));
            this.head = 0;
            this.size = this.capacity;
            return;
        }

        const writeStart = (this.head + this.size) % this.capacity;
        const spaceToEnd = this.capacity - writeStart;

        if (chunk.length <= spaceToEnd) {
            this.buf.set(chunk, writeStart);
        } else {
            // Wrap around
            this.buf.set(chunk.subarray(0, spaceToEnd), writeStart);
            this.buf.set(chunk.subarray(spaceToEnd), 0);
        }

        this.size += chunk.length;
        if (this.size > this.capacity) {
            // Overflowed — advance head past overwritten data
            this.head = (this.head + this.size - this.capacity) % this.capacity;
            this.size = this.capacity;
        }
    }

    peek(): Uint8Array {
        if (this.size === 0) return new Uint8Array(0);

        const result = new Uint8Array(this.size);
        const firstPart = Math.min(this.size, this.capacity - this.head);
        result.set(this.buf.subarray(this.head, this.head + firstPart));
        if (firstPart < this.size) {
            result.set(this.buf.subarray(0, this.size - firstPart), firstPart);
        }

        return result;
    }

    get length(): number {
        return this.size;
    }
}
