import he from "he";

export function decodeHTMLEntities(text: string): string {
    // Node
    return he.decode(text);
}

export function fromBase64(text: string): string {
    return Buffer.from(text, "base64").toString("utf8");
}

export function toBase64(text: string): string {
    return Buffer.from(text).toString("base64");
}
