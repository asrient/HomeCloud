import { isArrayBuffer } from "../compat/arrayBuffer.js";
import { isBuffer } from "../compat/buffer.js";
import { BufferLike, ErrorCode } from "../types.js";

export function calculateDataLength(data: string | BufferLike): number {
    if (isArrayBuffer(data)) {
        return (<ArrayBuffer>data).byteLength;
    } else if (isBuffer(data)) {
        return (<Buffer>data).length;
    } else if (typeof data === "string") {
        return Buffer.byteLength(data, "utf8");
    }
    throw new Error("Cannot calculate data length: Invalid type");
}
