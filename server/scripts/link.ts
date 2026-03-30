#!/usr/bin/env node
/**
 * HomeCloud Server Link Script
 *
 * Standalone utility to pre-provision server credentials.
 * Run this on any machine with Node.js, then copy the output files
 * to the server's config directory.
 *
 * Usage: npx ts-node scripts/link.ts [email] [output-dir]
 */

import readline from 'readline';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    return new Promise((resolve, reject) => {
        crypto.generateKeyPair('rsa', { modulusLength: 2048 }, (err, publicKey, privateKey) => {
            if (err) reject(err);
            else resolve({
                publicKey: publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
                privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
            });
        });
    });
}

function getKeyFromPem(pem: string): string {
    const key = pem.match(/-----BEGIN (.*)-----([^-]*)-----END \1-----/)?.[2];
    return key ? key.replace(/\n/g, '') : '';
}

function getFingerprint(publicKeyPem: string): string {
    const base64Key = getKeyFromPem(publicKeyPem);
    return crypto.createHash('sha256').update(base64Key).digest('hex');
}

async function main() {
    const email = process.argv[2] || await prompt('Email: ');
    const outputDir = process.argv[3] || '.';

    if (!email) {
        console.error('Email is required');
        process.exit(1);
    }

    const authServerUrl = process.env.HOMECLOUD_AUTH_URL || 'http://localhost:4000';

    console.log('Generating RSA-2048 key pair...');
    const { publicKey, privateKey } = await generateKeyPair();
    const fingerprint = getFingerprint(publicKey);
    console.log(`Fingerprint: ${fingerprint}`);

    // Build signed packet (matches accountService.createSignedPacket format)
    const peerInfo = {
        fingerprint,
        deviceName: 'HomeCloud Server',
        version: '0.0.1',
        deviceInfo: { os: 'linux', osFlavour: null, formFactor: 'server' },
        iconKey: null,
    };

    const data = JSON.stringify({ fingerprint, email, peerInfo });
    const sign = crypto.createSign('RSA-SHA512');
    sign.update(data);
    sign.end();
    const signature = sign.sign(privateKey).toString('base64');

    const linkReq = {
        data,
        signature,
        publicKeyPem: publicKey,
        expireAt: Date.now() + 3 * 60 * 1000,
        nonce: crypto.randomUUID(),
    };

    console.log(`Registering with auth server at ${authServerUrl}...`);
    const linkResp = await fetch(`${authServerUrl}/api/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(linkReq),
    });

    if (!linkResp.ok) {
        const text = await linkResp.text();
        throw new Error(`Link failed: ${linkResp.status} ${text}`);
    }

    const linkData = await linkResp.json() as any;

    let pin: string | null = null;
    if (linkData.requiresVerification) {
        console.log('Check your email for a 6-digit PIN.');
        pin = await prompt('PIN: ');
    }

    const verifyResp = await fetch(`${authServerUrl}/api/link-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: linkData.requestId, pin }),
    });

    if (!verifyResp.ok) {
        const text = await verifyResp.text();
        throw new Error(`Verify failed: ${verifyResp.status} ${text}`);
    }

    const verifyData = await verifyResp.json() as any;

    // Write output files
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'publicKey.pem'), publicKey);
    await fs.writeFile(path.join(outputDir, 'privateKey.pem'), privateKey);
    await fs.writeFile(path.join(outputDir, 'config.json'), JSON.stringify({
        email,
        fingerprint,
        accountId: verifyData.accountId,
        authToken: verifyData.authToken,
        tokenExpiry: verifyData.tokenExpiry,
        publicKey,
        privateKey,
    }, null, 2));

    console.log(`\nSuccess! Files written to ${path.resolve(outputDir)}:`);
    console.log('  publicKey.pem');
    console.log('  privateKey.pem');
    console.log('  config.json');
    console.log('\nCopy config.json to your server\'s HOMECLOUD_CONFIG_DIR.');
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
