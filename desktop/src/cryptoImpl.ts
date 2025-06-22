import CryptoModule from "shared/crypto";
import { EncryptedData } from "shared/crypto";
import crypto from "crypto";

export default class CryptoImpl extends CryptoModule {
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
                        publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
                    });
                }
            });
        });
    }

    getFingerprintFromBase64(base64PublicKey: string): string {
        // Generate the hash (fingerprint) of the public key using SHA-256
        const hash = crypto.createHash('sha256');
        hash.update(base64PublicKey, 'base64');
        return hash.digest('hex');
    }

    generateRandomKey(): string {
        return crypto.randomBytes(32).toString("hex");
    }

    encryptPK(data: string | Uint8Array, publicKeyPem: string): Uint8Array {
        if(typeof data === 'string') {
            data = Buffer.from(data, 'utf8');
        }
        const encrypted = crypto.publicEncrypt(publicKeyPem, data);
        return encrypted;
    }

    decryptPK(data: string | Uint8Array, privateKeyPem: string) {
        if(typeof data === 'string') {
            data = Buffer.from(data, 'base64');
        }
        const decrypted = crypto.privateDecrypt(privateKeyPem, data);
        return decrypted;
    }

    sign(data: string | Uint8Array, privateKeyPem: string): Uint8Array {
        const sign = crypto.createSign('SHA256');
        sign.update(data);
        sign.end();
        const signature = sign.sign(privateKeyPem);
        return signature;
    }

    verifySignature(data: string | Uint8Array, signature: string | Uint8Array, publicKeyPem: string) {
        if(typeof signature === 'string') {
            signature = Buffer.from(signature, 'base64');
        }
        const verify = crypto.createVerify('SHA256');
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
}
