import CryptoModule, { EncryptedData } from "shared/crypto";
import { RSA } from 'react-native-rsa-native';
import CryptoES from 'crypto-es';
import * as Crypto from 'expo-crypto';

export default class CryptoImpl extends CryptoModule {
    async generateKeyPair(): Promise<{
        privateKey: string;
        publicKey: string;
    }> {
        const keyPair = await RSA.generateKeys(2048);
        return {
            privateKey: keyPair.private,
            publicKey: keyPair.public,
        };
    }

    getFingerprintFromBase64(base64PublicKey: string): string {
        // Generate the hash (fingerprint) of the public key using SHA-256
        const hash = CryptoES.SHA256(base64PublicKey);
        return hash.toString(CryptoES.enc.Hex);
    }

    generateRandomKey(): string {
        const randomBytes = CryptoES.lib.WordArray.random(32);
        return randomBytes.toString(CryptoES.enc.Hex);
    }

    async encryptPK(data: string | Uint8Array, publicKeyPem: string): Promise<Uint8Array> {
        let dataString: string;
        if (data instanceof Uint8Array) {
            dataString = Array.from(data, byte => String.fromCharCode(byte)).join('');
        } else {
            dataString = data;
        }
        
        const encrypted = await RSA.encrypt(dataString, publicKeyPem);
        // Convert base64 string to Uint8Array
        const binaryString = atob(encrypted);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    async decryptPK(data: string | Uint8Array, privateKeyPem: string): Promise<Uint8Array> {
        let base64Data: string;
        if (data instanceof Uint8Array) {
            // Convert Uint8Array to base64 string
            const binaryString = Array.from(data, byte => String.fromCharCode(byte)).join('');
            base64Data = btoa(binaryString);
        } else {
            base64Data = data;
        }
        
        const decrypted = await RSA.decrypt(base64Data, privateKeyPem);
        return new TextEncoder().encode(decrypted);
    }

    async sign(data: string | Uint8Array, privateKeyPem: string): Promise<Uint8Array> {
        let dataString: string;
        if (data instanceof Uint8Array) {
            dataString = new TextDecoder().decode(data);
        } else {
            dataString = data;
        }
        
        const signature = await RSA.sign(dataString, privateKeyPem);
        // Convert base64 signature to Uint8Array
        const binaryString = atob(signature);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    async verifySignature(data: string | Uint8Array, signature: string | Uint8Array, publicKeyPem: string): Promise<boolean> {
        let dataString: string;
        if (data instanceof Uint8Array) {
            dataString = new TextDecoder().decode(data);
        } else {
            dataString = data;
        }
        
        let signatureBase64: string;
        if (signature instanceof Uint8Array) {
            // Convert Uint8Array to base64 string
            const binaryString = Array.from(signature, byte => String.fromCharCode(byte)).join('');
            signatureBase64 = btoa(binaryString);
        } else {
            signatureBase64 = signature;
        }
        
        return await RSA.verify(signatureBase64, dataString, publicKeyPem);
    }

    encryptString(text: string, secretKey: string): EncryptedData {
        // Generate a random 16-byte IV
        const iv = CryptoES.lib.WordArray.random(16);
        
        // Convert secret key from hex to WordArray
        const key = CryptoES.enc.Hex.parse(secretKey);
        
        // Encrypt using AES-CTR
        const encrypted = CryptoES.AES.encrypt(text, key, {
            iv: iv,
            mode: CryptoES.mode.CTR,
            padding: CryptoES.pad.NoPadding
        });
        
        return {
            iv: iv.toString(CryptoES.enc.Hex),
            payload: encrypted.ciphertext?.toString(CryptoES.enc.Hex) || ''
        };
    }

    decryptString(encrypted: EncryptedData, secretKey: string): string {
        // Parse IV and key from hex
        const iv = CryptoES.enc.Hex.parse(encrypted.iv);
        const key = CryptoES.enc.Hex.parse(secretKey);
        
        // Create cipher params object
        const cipherParams = CryptoES.lib.CipherParams.create({
            ciphertext: CryptoES.enc.Hex.parse(encrypted.payload)
        });
        
        // Decrypt using AES-CTR
        const decrypted = CryptoES.AES.decrypt(cipherParams, key, {
            iv: iv,
            mode: CryptoES.mode.CTR,
            padding: CryptoES.pad.NoPadding
        });
        
        return decrypted.toString(CryptoES.enc.Utf8);
    }

    hashString(data: string, type: 'sha256' | 'md5' = 'sha256'): string {
        if (type === 'sha256') {
            return CryptoES.SHA256(data).toString(CryptoES.enc.Hex);
        } else {
            return CryptoES.MD5(data).toString(CryptoES.enc.Hex);
        }
    }

    compareHash(data: string, hash: string, type: 'sha256' | 'md5' = 'sha256'): boolean {
        return this.hashString(data, type) === hash;
    }

    generateHmac(data: string, secret: string): string {
        return CryptoES.HmacSHA256(data, secret).toString(CryptoES.enc.Hex);
    }

    compareHmac(data: string, hmac: string, secret: string): boolean {
        return this.generateHmac(data, secret) === hmac;
    }

    uuid(): string {
        return Crypto.randomUUID();
    }
}
