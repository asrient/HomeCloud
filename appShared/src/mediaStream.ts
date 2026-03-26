/**
 * HCMediaStream — Binary chunk format for streaming media over RPC ReadableStream.
 *
 * Each chunk:
 *   [2B metadata_length (uint16 big-endian)]
 *   [metadata_length bytes: key=value pairs, newline-separated, UTF-8]
 *   [remaining bytes: binary payload (e.g. H.264 NAL units)]
 *
 * Metadata keys (sent when changed, first chunk always has all):
 *   type     — "keyframe" or "delta"
 *   width    — pixel width of the frame
 *   height   — pixel height of the frame
 *   dpi      — pixel density (e.g. 2 for Retina)
 *   ts       — capture timestamp in ms
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface MediaChunkMetadata {
    [key: string]: string;
}

/**
 * Encode metadata + binary payload into a single chunk.
 */
export function encodeMediaChunk(
    metadata: MediaChunkMetadata,
    payload: Uint8Array,
): Uint8Array {
    const metaStr = Object.entries(metadata)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
    const metaBytes = textEncoder.encode(metaStr);
    const metaLen = metaBytes.byteLength;

    const chunk = new Uint8Array(2 + metaLen + payload.byteLength);
    // Write metadata length as uint16 BE
    chunk[0] = (metaLen >> 8) & 0xff;
    chunk[1] = metaLen & 0xff;
    // Write metadata
    chunk.set(metaBytes, 2);
    // Write payload
    chunk.set(payload, 2 + metaLen);
    return chunk;
}

/**
 * Decode a chunk into metadata + binary payload.
 */
export function decodeMediaChunk(
    chunk: Uint8Array,
): { metadata: MediaChunkMetadata; payload: Uint8Array } {
    const metaLen = (chunk[0] << 8) | chunk[1];
    const metaBytes = chunk.slice(2, 2 + metaLen);
    const payload = chunk.slice(2 + metaLen);

    const metadata: MediaChunkMetadata = {};
    const metaStr = textDecoder.decode(metaBytes);
    if (metaStr.length > 0) {
        for (const line of metaStr.split('\n')) {
            const eq = line.indexOf('=');
            if (eq > 0) {
                metadata[line.slice(0, eq)] = line.slice(eq + 1);
            }
        }
    }

    return { metadata, payload };
}
