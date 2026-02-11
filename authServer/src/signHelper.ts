import crypto from 'crypto';

export function verifySignature(data: string | Uint8Array, signature: string | Uint8Array, publicKeyPem: string): boolean {
    if (typeof signature === 'string') {
        signature = Buffer.from(signature, 'base64');
    }
    const verify = crypto.createVerify('RSA-SHA512');
    verify.update(data);
    return verify.verify(publicKeyPem, signature);
}

function getKeyFromPem(pem: string) {
    // Extract the key from the PEM string
    const match = pem.match(/-----BEGIN (.*)-----([^-]*)-----END \1-----/);
    if (!match) {
        throw new Error('Invalid PEM format');
    }
    const key = match[2];
    return key.replace(/\n/g, '');
}

function getFingerprintFromBase64(base64PublicKey: string): string {
    // Generate the hash (fingerprint) of the public key using SHA-256
    const hash = crypto.createHash('sha256');
    hash.update(base64PublicKey); // hashing the base64 string directly
    return hash.digest('hex');
}

export function getFingerprintFromPem(publicKeyPem: string) {
    const publicKey = getKeyFromPem(publicKeyPem);
    return getFingerprintFromBase64(publicKey);
}
