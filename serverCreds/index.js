#!/usr/bin/env node

/**
 * Interactive script to generate credentials for the HomeCloud Server.
 * 
 * Generates RSA key pair, links the device to an account via the auth server,
 * encrypts the private key, and outputs the credentials file.
 * 
 * Usage: node tools/create-server-creds.js
 */

const crypto = require('node:crypto');
const readline = require('node:readline');

const SERVER_URL = 'https://homecloudapi.asrient.com';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

function generateKeyPair() {
    return new Promise((resolve, reject) => {
        crypto.generateKeyPair('rsa', { modulusLength: 2048 }, (err, publicKey, privateKey) => {
            if (err) return reject(err);
            resolve({
                privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
                publicKeyPem: publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
            });
        });
    });
}

function getKeyFromPem(pem) {
    const match = pem.match(/-----BEGIN (.*)-----([^-]*)-----END \1-----/);
    if (!match) throw new Error('Invalid PEM format');
    return match[2].replace(/\n/g, '');
}

function getFingerprint(publicKeyPem) {
    const base64Key = getKeyFromPem(publicKeyPem);
    return crypto.createHash('sha256').update(base64Key).digest('hex');
}

function sign(data, privateKeyPem) {
    const signer = crypto.createSign('RSA-SHA512');
    signer.update(data);
    signer.end();
    return signer.sign(privateKeyPem);
}

function deriveKey(passphrase, salt) {
    return crypto.scryptSync(passphrase, salt, 32);
}

function encryptString(text, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return {
        iv: iv.toString('hex'),
        payload: encrypted.toString('hex'),
    };
}

async function createSignedPacket(data, privateKeyPem, publicKeyPem) {
    const dataStr = JSON.stringify(data);
    const signature = sign(Buffer.from(dataStr), privateKeyPem);
    return {
        data: dataStr,
        signature: signature.toString('base64'),
        publicKeyPem,
        expireAt: Date.now() + 3 * 60 * 1000,
        nonce: crypto.randomUUID(),
    };
}

async function initiateLink(serverUrl, packet) {
    const resp = await fetch(`${serverUrl}/api/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packet),
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Link initiation failed (${resp.status}): ${body}`);
    }
    return resp.json();
}

async function verifyLink(serverUrl, requestId, pin) {
    const resp = await fetch(`${serverUrl}/api/link-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, pin }),
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Link verification failed (${resp.status}): ${body}`);
    }
    return resp.json();
}

async function main() {
    console.log('=== HomeCloud Server Credentials Generator ===\n');

    const email = await ask('Email: ');
    if (!email.trim()) {
        console.error('Email is required.');
        process.exit(1);
    }

    const serverName = await ask('Server name: ');
    if (!serverName.trim()) {
        console.error('Server name is required.');
        process.exit(1);
    }

    console.log('\nGenerating RSA key pair...');
    const { privateKeyPem, publicKeyPem } = await generateKeyPair();
    const fingerprint = getFingerprint(publicKeyPem);
    console.log(`Fingerprint: ${fingerprint}`);

    const peerInfo = {
        deviceName: serverName.trim(),
        fingerprint,
        version: '0.0.1',
        deviceInfo: {
            os: 'linux',
            osFlavour: null,
            formFactor: 'server',
        },
        iconKey: null,
    };

    console.log('\nInitiating account link...');
    const packet = await createSignedPacket({
        email: email.trim(),
        accountId: null,
        fingerprint,
        peerInfo,
    }, privateKeyPem, publicKeyPem);

    const linkResp = await initiateLink(SERVER_URL, packet);
    console.log(`Request ID: ${linkResp.requestId}`);

    let verifyResp;
    if (linkResp.requiresVerification) {
        console.log(`\nA verification PIN has been sent to ${email.trim()}`);
        const pin = await ask('Enter PIN: ');
        if (!pin.trim()) {
            console.error('PIN is required.');
            process.exit(1);
        }
        verifyResp = await verifyLink(SERVER_URL, linkResp.requestId, pin.trim());
    } else {
        verifyResp = await verifyLink(SERVER_URL, linkResp.requestId, null);
    }

    console.log(`\nAccount linked successfully!`);
    console.log(`Account ID: ${verifyResp.accountId}`);

    const passphrase = await ask('\nChoose a passphrase (min 6 chars): ');
    if (!passphrase.trim() || passphrase.trim().length < 6) {
        console.error('Passphrase must be at least 6 characters.');
        process.exit(1);
    }

    const salt = crypto.randomBytes(16);
    const derivedKey = deriveKey(passphrase.trim(), salt);
    const encrytPrivatePem = encryptString(privateKeyPem, derivedKey);

    const creds = {
        publicPem: publicKeyPem,
        encrytPrivatePem,
        salt: salt.toString('hex'),
        accountId: verifyResp.accountId,
    };

    const credsJson = JSON.stringify(creds, null, 2);

    console.log('\n=== Passphrase (save this — required to start the server) ===');
    console.log(passphrase.trim());

    console.log('\n--- Output ---');
    const fs = require('node:fs');
    const path = require('node:path');
    const resolved = path.resolve('./creds.json');
    fs.writeFileSync(resolved, credsJson, 'utf-8');
    console.log(`Credentials written to ${resolved}`);
    console.log(`\nSet these env vars to run the server:`);
    console.log(`  PASSPHRASE=${passphrase.trim()}`);
    console.log(`  CREDS_PATH=path/to/creds.json`);

    const wantBase64 = await ask('\nAlso copy as base64? [y/N]: ');
    if (wantBase64.trim().toLowerCase() === 'y') {
        const base64 = Buffer.from(credsJson).toString('base64');
        console.log('\n=== Base64 Credentials (copy this) ===');
        console.log(base64);
        console.log(`\nUse this instead of CREDS_PATH:`);
        console.log(`  CREDS_BASE64=<the base64 string above>`);
    }

    rl.close();
}

main().catch((err) => {
    console.error(`\nError: ${err.message}`);
    rl.close();
    process.exit(1);
});
