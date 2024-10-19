import { cryptoUtils } from "@homecloud/js-core";

console.log(`
--- HomeCloud Key Generation ---
This script will generate the cryptographic keys required for HomeCloud Servers to run.
Copy the following and set them as environment variables in your server:
--------------------------------
`);

const { privateKey, publicKey, cert } = cryptoUtils.generateKeyPair();
console.log("PRIVATE_KEY=", privateKey);
console.log("PUBLIC_KEY=", publicKey);
console.log("CERT=", cert);
const secretKey = cryptoUtils.generateRandomKey();
console.log("SECRET_KEY=", secretKey);
console.log(`
-----------------------------
Keys generation completed.
[Important] Never store the private key and secret key in plain text.
Private key, public key, and cert are related and should always be used together.

////////////////////////////////////
Fingerprint: ${cryptoUtils.getFingerprint(publicKey)}
////////////////////////////////////

HomeCloud @ASRIENT 1.10.2024
`);
