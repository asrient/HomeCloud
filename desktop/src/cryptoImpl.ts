import CryptoModule from "shared/crypto";
import { EncryptedData } from "shared/crypto";
import crypto from "crypto";

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

    generateKeyPair(): Promise<{
        privateKey: string;
        publicKey: string;
    }> {
        return new Promise((resolve, reject) => {
            crypto.generateKeyPair("rsa", { modulusLength: 2048 }, (err, publicKey, privateKey) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
                        publicKey: publicKey.export({ type: "pkcs1", format: "pem" }).toString(),
                    });
                }
            });
        });
    }

    getFingerprintFromBase64(base64PublicKey: string): string {
        // Generate the hash (fingerprint) of the public key using SHA-256
        const hash = crypto.createHash('sha256');
        hash.update(base64PublicKey); // hashing the base64 string directly
        return hash.digest('hex');
    }

    generateRandomKey(): string {
        return crypto.randomBytes(32).toString("hex");
    }

    async encryptPK(data: string | Uint8Array, publicKeyPem: string): Promise<Uint8Array> {
        if (typeof data === 'string') {
            data = Buffer.from(data, 'utf8');
        }
        const encrypted = crypto.publicEncrypt({
            key: publicKeyPem,
            padding: crypto.constants.RSA_PKCS1_PADDING, // This constant represents PKCS#1 v1.5 padding
        }, data);
        return encrypted;
    }

    async decryptPK(data: string | Uint8Array, privateKeyPem: string): Promise<Uint8Array> {
        if (typeof data === 'string') {
            data = Buffer.from(data, 'base64');
        }
        const decrypted = crypto.privateDecrypt({
            key: privateKeyPem,
            padding: crypto.constants.RSA_PKCS1_PADDING,
        }, data);
        return decrypted;
    }

    async sign(data: string | Uint8Array, privateKeyPem: string): Promise<Uint8Array> {
        const sign = crypto.createSign('RSA-SHA512');
        sign.update(data);
        sign.end();
        const signature = sign.sign(privateKeyPem);
        return signature;
    }

    async verifySignature(data: string | Uint8Array, signature: string | Uint8Array, publicKeyPem: string): Promise<boolean> {
        if (typeof signature === 'string') {
            signature = Buffer.from(signature, 'base64');
        }
        const verify = crypto.createVerify('RSA-SHA512');
        verify.update(data);
        return verify.verify(publicKeyPem, signature);
    }

    encryptString(text: string, secretKey: string): EncryptedData {
        // Generate a random 16-byte IV (Initialization Vector)
        const iv = crypto.randomBytes(16);

        // Create the cipher object with the AES-256-CTR algorithm, secret key, and IV
        const cipher = crypto.createCipheriv('aes-256-ctr', secretKey, iv);

        // Encrypt the text
        const encryptedText = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

        // Return the IV and encrypted data as a hex string
        return {
            iv: iv.toString('hex'), // The IV (needed for decryption)
            payload: encryptedText.toString('hex'), // The ciphertext
        };
    }

    // Function to decrypt data using AES-256-CTR with the IV
    decryptString(encrypted: EncryptedData, secretKey: string): string {
        // Convert the IV from hex back to a buffer
        const iv = Buffer.from(encrypted.iv, 'hex');

        // Create the decipher object using the same secret key and IV
        const decipher = crypto.createDecipheriv('aes-256-ctr', secretKey, iv);

        // Decrypt the ciphertext
        const decryptedText = Buffer.concat([decipher.update(Buffer.from(encrypted.payload, 'hex')), decipher.final()]);

        return decryptedText.toString('utf8');
    }

    hashString(data: string, type: 'sha256' | 'md5' = 'sha256') {
        const hash = crypto.createHash(type);
        hash.update(data);
        return hash.digest('hex');
    }

    compareHash(data: string, hash: string, type: 'sha256' | 'md5' = 'sha256') {
        return this.hashString(data, type) === hash;
    }

    generateHmac(data: string, secret: string) {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(data);
        return hmac.digest('hex');
    }

    compareHmac(data: string, hmac: string, secret: string) {
        return this.generateHmac(data, secret) === hmac;
    }

    uuid() {
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
}
