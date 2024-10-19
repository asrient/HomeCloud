import selfsigned from 'selfsigned';
import crypto from 'crypto';

export const generateKeyPair = () => {
    // Generate self-signed certificate with no CN
    const attrs = [{ name: 'commonName', value: '' }]; // Leave CN blank or set to 'localhost'
    const options = {
        keySize: 2048,    // Key size
        days: 365 * 5,        // Valid for 5 years
        algorithm: 'sha256',  // Use SHA-256
        extensions: [{ name: 'basicConstraints', cA: true }] // Example extensions
    };

    // Generate the certificate
    const pems = selfsigned.generate(attrs, options);

    return {
        privateKey: pems.private,
        cert: pems.cert,
        publicKey: pems.public,
    }
};

export function getFingerprint(publicKey: string) {
    // Generate the hash (fingerprint) of the public key using SHA-256
    const hash = crypto.createHash('sha256');
    hash.update(publicKey);
    return hash.digest('hex');
}

export function verifyFingerprint(publicKey: string, fingerprint: string) {
    return getFingerprint(publicKey) === fingerprint;
}

export function generateRandomKey() {
    return crypto.randomBytes(32).toString('hex');
}

export function generateOTP() {
   return Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
}

export function encryptStringPK(data: string, publicKey: string) {
    const buffer = Buffer.from(data, 'utf8');
    const encrypted = crypto.publicEncrypt(publicKey, buffer);
    return encrypted.toString('base64');
}

export function decryptStringPK(data: string, privateKey: string) {
    const buffer = Buffer.from(data, 'base64');
    const decrypted = crypto.privateDecrypt(privateKey, buffer);
    return decrypted.toString('utf8');
}

export function signString(data: string, privateKey: string) {
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    return sign.sign(privateKey, 'base64');
}

export function verifySignature(data: string, signature: string, publicKey: string) {
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    return verify.verify(publicKey, signature, 'base64');
}

export type EncryptedData = {
    iv: string;
    payload: string
};

// Function to encrypt data using AES-256-CTR with a random IV
export function encryptString(text: string, secretKey: string): EncryptedData {
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
export function decryptString(encrypted: EncryptedData, secretKey: string): string {
    // Convert the IV from hex back to a buffer
    const iv = Buffer.from(encrypted.iv, 'hex');

    // Create the decipher object using the same secret key and IV
    const decipher = crypto.createDecipheriv('aes-256-ctr', secretKey, iv);

    // Decrypt the ciphertext
    const decryptedText = Buffer.concat([decipher.update(Buffer.from(encrypted.payload, 'hex')), decipher.final()]);

    return decryptedText.toString('utf8');
}

export function hashString(data: string) {
    const hash = crypto.createHash('sha256');
    hash.update(data);
    return hash.digest('hex');
}

export function compareHash(data: string, hash: string) {
    return hashString(data) === hash;
}

export function generateHmac(data: string, secret: string) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    return hmac.digest('hex');
}

export function compareHmac(data: string, hmac: string, secret: string) {
    return generateHmac(data, secret) === hmac;
}

export function uuid() {
    return crypto.randomUUID();
}
