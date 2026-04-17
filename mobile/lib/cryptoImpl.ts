import CryptoModule, { EncryptedData } from "shared/crypto";
import QuickCrypto from 'react-native-quick-crypto';

// react-native-quick-crypto provides a Node.js-compatible crypto API backed by
// native C++/JSI (BoringSSL on Android, CommonCrypto on iOS).
const crypto = QuickCrypto;

export default class CryptoImpl extends CryptoModule {
    private keyCache = new Map<string, Buffer>();

    private getParsedKey(hexKey: string): Buffer {
        let parsed = this.keyCache.get(hexKey);
        if (!parsed) {
            parsed = Buffer.from(hexKey, 'hex');
            this.keyCache.set(hexKey, parsed);
        }
        return parsed;
    }

    async generateKeyPair(): Promise<{
        privateKey: string;
        publicKey: string;
    }> {
        return new Promise((resolve, reject) => {
            crypto.generateKeyPair("rsa", { modulusLength: 2048 }, ((err: any, publicKey: any, privateKey: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
                        publicKey: publicKey.export({ type: "pkcs1", format: "pem" }).toString(),
                    });
                }
            }) as any);
        });
    }

    getFingerprintFromBase64(base64PublicKey: string): string {
        const hash = crypto.createHash('sha256');
        hash.update(base64PublicKey);
        return hash.digest('hex').toString();
    }

    generateRandomKey(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    async encryptPK(data: string | Uint8Array, publicKeyPem: string): Promise<Uint8Array> {
        if (typeof data === 'string') {
            data = Buffer.from(data, 'utf8');
        }
        const encrypted = crypto.publicEncrypt({
            key: publicKeyPem,
            padding: crypto.constants.RSA_PKCS1_PADDING,
        }, data as any);
        return new Uint8Array(encrypted);
    }

    async decryptPK(data: string | Uint8Array, privateKeyPem: string): Promise<Uint8Array> {
        if (typeof data === 'string') {
            data = Buffer.from(data, 'base64');
        }
        const decrypted = crypto.privateDecrypt({
            key: privateKeyPem,
            padding: crypto.constants.RSA_PKCS1_PADDING,
        }, data as any);
        return new Uint8Array(decrypted);
    }

    async sign(data: string | Uint8Array, privateKeyPem: string): Promise<Uint8Array> {
        const sign = crypto.createSign('RSA-SHA512');
        sign.update(data as any);
        const signature = sign.sign(privateKeyPem);
        return new Uint8Array(signature);
    }

    async verifySignature(data: string | Uint8Array, signature: string | Uint8Array, publicKeyPem: string): Promise<boolean> {
        if (typeof signature === 'string') {
            signature = Buffer.from(signature, 'base64');
        }
        const verify = crypto.createVerify('RSA-SHA512');
        verify.update(data as any);
        return verify.verify(publicKeyPem, signature as any);
    }

    encryptString(text: string, secretKey: string): EncryptedData {
        const iv = crypto.randomBytes(16);
        // secretKey is a 64-char hex string (32 bytes); decode to Buffer for AES-256.
        const key = Buffer.from(secretKey, 'hex');
        const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
        const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
        return {
            iv: iv.toString('hex'),
            payload: encrypted.toString('hex'),
        };
    }

    decryptString(encrypted: EncryptedData, secretKey: string): string {
        const iv = Buffer.from(encrypted.iv, 'hex');
        const key = Buffer.from(secretKey, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
        const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted.payload, 'hex')), decipher.final()]);
        return decrypted.toString('utf8');
    }

    hashString(data: string, type: 'sha256' | 'md5' = 'sha256'): string {
        const hash = crypto.createHash(type);
        hash.update(data);
        return hash.digest('hex').toString();
    }

    compareHash(data: string, hash: string, type: 'sha256' | 'md5' = 'sha256'): boolean {
        return this.hashString(data, type) === hash;
    }

    generateHmac(data: string, secret: string): string {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(data);
        return hmac.digest('hex');
    }

    compareHmac(data: string, hmac: string, secret: string): boolean {
        return this.generateHmac(data, secret) === hmac;
    }

    uuid(): string {
        return crypto.randomUUID();
    }

    async bufferToBase64(data: Uint8Array): Promise<string> {
        return Buffer.from(data).toString('base64');
    }

    encryptBuffer(data: Uint8Array, secretKey: string): Uint8Array {
        const iv = crypto.randomBytes(16);
        const key = this.getParsedKey(secretKey);
        const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
        const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        // Prepend IV to ciphertext: [IV (16 bytes)][ciphertext]
        const result = new Uint8Array(16 + encrypted.length);
        result.set(iv, 0);
        result.set(encrypted, 16);
        return result;
    }

    decryptBuffer(data: Uint8Array, secretKey: string): Uint8Array {
        const iv = data.slice(0, 16);
        const ciphertext = data.slice(16);
        const key = this.getParsedKey(secretKey);
        const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
        return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
    }

    generateIv(): string {
        return crypto.randomBytes(16).toString('hex');
    }

    createCipher(secretKey: string, iv: string): { update(data: Uint8Array): Uint8Array } {
        const key = this.getParsedKey(secretKey);
        const cipher = crypto.createCipheriv('aes-256-ctr', key, Buffer.from(iv, 'hex'));
        return {
            update: (data: Uint8Array): Uint8Array => new Uint8Array(cipher.update(data)),
        };
    }

    createDecipher(secretKey: string, iv: string): { update(data: Uint8Array): Uint8Array } {
        const key = this.getParsedKey(secretKey);
        const decipher = crypto.createDecipheriv('aes-256-ctr', key, Buffer.from(iv, 'hex'));
        return {
            update: (data: Uint8Array): Uint8Array => new Uint8Array(decipher.update(data)),
        };
    }
}

