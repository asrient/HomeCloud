import { NativeAsk, native } from "../native";
import CustomError, { ErrorCode } from "../customError";
import { envConfig, PairingAuthType, RequestOriginType } from "../envConfig";
import { Agent } from "../models";
import { verifySignature, signString, uuid, generateOTP, getFingerprintFromBase64, generatePemFromBase64, KeyType } from "../utils/cryptoUtils";
import { generateJwt } from "../utils/profileUtils";
import { PairingRequest } from "./types";

const QUEUE_LIMIT = 10;

const requiredFields = [
    "clientDeviceName",
    "clientFinerprint",
    "targetFingerprint",
    "expireAt"
];

export interface PairingRequestPacket {
    payload: string;
    signature: string;
}

export function createPairingRequest(fingerprint: string): PairingRequest {
    return {
        clientDeviceName: envConfig.DEVICE_NAME,
        clientFinerprint: envConfig.FINGERPRINT,
        targetFingerprint: fingerprint,
        expireAt: Date.now() + 1000 * 60 * 5,
    };
}

export function createPairingRequestPacket(pairingRequest: PairingRequest): PairingRequestPacket {
    const payload = JSON.stringify(pairingRequest);
    const signature = signString(payload, envConfig.PRIVATE_KEY_PEM);
    return { payload, signature };
}

export function validatePairingRequest(packet: PairingRequestPacket, clientPublicKey: string) {
    const clientPublicKeyPem = generatePemFromBase64(clientPublicKey, KeyType.PUBLIC_KEY);
    const isValid = verifySignature(packet.payload, packet.signature, clientPublicKeyPem);
    if (!isValid) {
        throw CustomError.security("Invalid signature");
    }
    let pairingRequest: PairingRequest;
    try {
        pairingRequest = JSON.parse(packet.payload) as PairingRequest;
    } catch (e) {
        throw CustomError.validationSingle('payload', "Invalid payload");
    }
    // Make sure all the fields are present
    for (const field of requiredFields) {
        if (!pairingRequest.hasOwnProperty(field)) {
            throw CustomError.validationSingle(field, "Field is required.");
        }
    }
    if (pairingRequest.expireAt < Date.now()) {
        throw CustomError.security("Request expired");
    }
    // verify fingerprint
    if (pairingRequest.clientFinerprint !== getFingerprintFromBase64(clientPublicKey)) {
        throw CustomError.security("Invalid client fingerprint");
    }
    if (pairingRequest.targetFingerprint !== envConfig.FINGERPRINT) {
        throw CustomError.security("Invalid target fingerprint");
    }
    if (!envConfig.IS_DEV && envConfig.FINGERPRINT === pairingRequest.clientFinerprint) {
        throw CustomError.security("Attempted to pair with self.");
    }
    return pairingRequest;
}

const pairingRequests: Map<string, {
    pairingRequest: PairingRequest,
    clientRemoteAddress: string | null,
    otp: string | null,
    expiryTimer: NodeJS.Timeout,
    askDialog: NativeAsk,
}> = new Map();

async function createAgent(pairingRequest: PairingRequest, authority: string) {
    if (!envConfig.IS_DEV && envConfig.FINGERPRINT === pairingRequest.clientFinerprint) {
        throw CustomError.security("Attempted to pair with self.");
    }
    const agent = await Agent.createAgent({
        fingerprint: pairingRequest.clientFinerprint,
        deviceName: pairingRequest.clientDeviceName,
        authority,
    });
    const canAddBack = !agent.clientAccessDisabled();
    if (canAddBack && !agent.hasClientAccess()) {
        agent.allowClientAccess = true;
        await agent.save();
    }
    return { agent, canAddBack };
}

export async function registerPairingRequest(packet: PairingRequestPacket, password: string | null, clientPublicKey: string, clientRemoteAddress: string):
    Promise<{
        accessKey?: string;
        token?: string;
    }> {
    if (pairingRequests.size >= QUEUE_LIMIT) {
        throw CustomError.code(ErrorCode.LIMIT_REACHED, "Please try again later.");
    }
    const pairingRequest = validatePairingRequest(packet, clientPublicKey);
    if (envConfig.PAIRING_AUTH_TYPE === PairingAuthType.Password) {
        throw CustomError.generic("Password pairing is not supported.");
    }
    // OTP flow for desktop GUIs
    const token = uuid();
    const otp = generateOTP();
    if (!native) {
        throw CustomError.generic("Could not open OTP dialog.");
    }
    const askDialog = native.otpFlow(pairingRequest, otp, () => {
        deletePairingRequest(token);
    });
    pairingRequests.set(token, {
        pairingRequest,
        clientRemoteAddress,
        otp,
        expiryTimer: setTimeout(() => {
            declinePairingRequest(token);
        }, 1000 * 60 * 5),
        askDialog,
    });
    console.debug(`
        -----------------------------
        ## OTP CONSENT SCREEN ##

        Token: ${token}

        Client Device: ${pairingRequest.clientDeviceName}
        Client Fingerprint: ${pairingRequest.clientFinerprint}
        Client IP Address: ${clientRemoteAddress}

        OTP: ${otp}
        -----------------------------
        `);
    return {
        token,
    };
}

function deletePairingRequest(token: string) {
    const request = pairingRequests.get(token);
    if (request) {
        request.expiryTimer && clearTimeout(request.expiryTimer);
        pairingRequests.delete(token);
    }
}

export function declinePairingRequest(token: string) {
    const request = pairingRequests.get(token);
    if (request) {
        request.askDialog.close();
        deletePairingRequest(token);
    }
}

export async function verifyOTP(token: string, otp: string, clientPublicKey: string) {
    const request = pairingRequests.get(token);
    if (!request) {
        throw CustomError.validationSingle("token", "Invalid token");
    }
    if (request.otp && request.otp !== otp) {
        throw CustomError.validationSingle("otp", "Invalid OTP");
    }
    const pairingRequest = request.pairingRequest;
    const currentFingerprint = getFingerprintFromBase64(clientPublicKey);
    if (pairingRequest.clientFinerprint !== currentFingerprint) {
        throw CustomError.validationSingle("fingerprint", "Invalid fingerprint");
    }
    const { agent, canAddBack } = await createAgent(pairingRequest, request.clientRemoteAddress);
    if (agent.clientAccessDisabled()) {
        throw CustomError.validationSingle("clientAccess", "Client access denied.");
    }
    const accessKey = generateJwt(RequestOriginType.Agent, agent.fingerprint, agent.id);
    deletePairingRequest(token);
    // todo: setup code for add back.
    return { accessKey };
}
