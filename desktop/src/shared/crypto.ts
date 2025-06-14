export type EncryptedData = {
    iv: string;
    payload: string
}

export enum KeyType {
    CERTIFICATE = 'CERTIFICATE',
    PUBLIC_KEY = 'PUBLIC KEY',
}

export default abstract class CryptoModule {
    abstract generateKeyPair(): Promise<{
        privateKey: string;
        publicKey: string;
    }>;

    getKeyFromPem(pem: string) {
        // Extract the key from the PEM string
        const key = pem.match(/-----BEGIN (.*)-----([^-]*)-----END \1-----/)[2];
        return key.replace(/\n/g, '');
    }

    generatePemFromBase64(base64Key: string, type: KeyType): string {
        const header = `-----BEGIN ${type}-----\n`;
        const footer = `\n-----END ${type}-----\n`;

        // Split the base64 string into chunks of 64 characters for better readability in PEM format
        const formattedKey = base64Key.match(/.{1,64}/g).join('\n');
        return header + formattedKey + footer;
    }

    abstract getFingerprintFromBase64(base64PublicKey: string): string;

    getFingerprintFromPem(publicKeyPem: string) {
        const publicKey = this.getKeyFromPem(publicKeyPem);
        return this.getFingerprintFromBase64(publicKey);
    }

    abstract generateRandomKey(): string;

    generateOTP() {
        return Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    }

    abstract encryptPK(data: string | Uint8Array, publicKeyPem: string): Uint8Array;
    abstract decryptPK(data: string | Uint8Array, privateKeyPem: string): Uint8Array;
    abstract sign(data: string, privateKeyPem: string): Uint8Array;
    abstract verifySignature(data: string | Uint8Array, signature: string | Uint8Array, publicKeyPem: string): boolean;
    abstract encryptString(text: string, secretKey: string): EncryptedData;
    abstract decryptString(encryptedData: EncryptedData, secretKey: string): string;
    abstract hashString(data: string, type: 'sha256' | 'md5'): string;
    abstract compareHash(data: string, hash: string, type: 'sha256' | 'md5'): boolean;
    abstract generateHmac(data: string, secret: string): string;
    abstract compareHmac(data: string, hmac: string, secret: string): boolean;
    abstract uuid(): string;
}
