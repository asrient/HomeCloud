import {
    Account, AccountLinkRequest, AccountLinkResponse,
    AccountLinkSignedPayload, HelloType, TokenType, PeerInfo,
    AccountLinkVerifyResponse, EventType, WebSocketEvent,
    Peer,
    AccountLinkVerifyRequest,
    WebcInit,
    WebcPeerData,
    WebcReject
} from "./types";
import globalComms from "./globalComms";
import { ObjectId } from "mongodb";
import mcdb from "./db";
import { objectIdtoStr, verifyJwtToken, uniqueCode, generatePin, generateJwtToken, code } from "./utils";
import CustomError from "./customError";
import { getFingerprintFromPem, verifySignature } from "./signHelper";
import { AccountLinkSignedPayloadSchema, WebSocketEventSchema } from "./schema";
import emailService from "./emailService";
import { UDP_PORT } from "./config";

export function healthCheck() {
    return { status: 'ok' };
}

export async function hello(data: HelloType) {
    return { message: `Hello, ${data.message}!` };
}

type WaitingLink = {
    accountId: string;
    fingerprint: string;
    peerInfo: PeerInfo | null;
    pin: string | null;
}

export async function linkAccount(payload: AccountLinkSignedPayload): Promise<AccountLinkResponse> {
    const { email, accountId, fingerprint, peerInfo } = payload;

    if (peerInfo && peerInfo.fingerprint !== fingerprint) {
        throw CustomError.validationSingle('peerInfo.fingerprint', 'Fingerprint in peerInfo does not match main fingerprint');
    }

    let account: Account | null = null;
    if (accountId) {
        account = await mcdb.getAccountById(accountId);
    } else if (email) {
        account = await mcdb.getOrCreateAccount(email);
    } else {
        throw CustomError.validationSingle('accountId', 'Either accountId or email must be provided');
    }

    if (!account) {
        throw CustomError.validationSingle('accountId', 'Account not found');
    }

    const existingPeer = await mcdb.getPeerByFingerprint(fingerprint);
    const isAccountChange = existingPeer ? objectIdtoStr(existingPeer.accountId) !== objectIdtoStr(account._id) : false;
    const requiresVerification = !existingPeer || isAccountChange;

    if (!existingPeer && !peerInfo) {
        throw CustomError.validationSingle('peerInfo', 'peerInfo must be provided for new peers');
    }

    // avoid accidental email sending if user has not explicitly provided email via ui
    if (isAccountChange && accountId && !email) {
        throw CustomError.validationSingle('email', 'Account change requires email to be provided');
    }

    const requestId = uniqueCode();
    const pin = requiresVerification ? generatePin(6) : null;

    const waitingLink: WaitingLink = {
        accountId: objectIdtoStr(account._id),
        fingerprint,
        peerInfo,
        pin,
    };

    await globalComms.setKV(`linkRequest_${requestId}`, JSON.stringify(waitingLink), pin ? 15 * 60 : 5 * 60); // 15 mins if pin, else 5 mins

    if (requiresVerification && pin) {
        emailService.sendEmail(account.email, `Your verification PIN is: ${pin}`);
    }
    return {
        requestId,
        isEmailChange: isAccountChange,
        requiresVerification,
    };
}

export async function notifyAccountPeers(accountId: string | ObjectId, event: WebSocketEvent, data: any) {
    const evt: EventType = {
        type: event,
        data,
    };
    await globalComms.publishEvent(`account_${objectIdtoStr(accountId)}`, JSON.stringify(evt));
}

export async function notifyPeer(id: string | ObjectId, event: WebSocketEvent, data: any) {
    const evt: EventType = {
        type: event,
        data,
    };
    await globalComms.publishEvent(`peer_${objectIdtoStr(id)}`, JSON.stringify(evt));
}

export async function createPeer(accountId: string | ObjectId, peerInfo: PeerInfo): Promise<Peer> {
    const peer = await mcdb.createPeer(accountId, peerInfo);
    await notifyAccountPeers(accountId, 'peer_added', peerToPeerInfo(peer));
    return peer;
}

export function peerToPeerInfo(peer: Peer): PeerInfo {
    return {
        deviceName: peer.deviceName,
        fingerprint: peer.fingerprint,
        version: peer.version,
        deviceInfo: { ...peer.deviceInfo },
        iconKey: peer.iconKey,
    };
}

export async function removePeer(peer: Peer): Promise<void> {
    const peerInfo = peerToPeerInfo(peer);
    // remove peer
    const result = await mcdb.removePeerById(peer._id);
    if (!result) {
        throw CustomError.generic('Failed to remove peer');
    }
    // notify all account peers about removal
    await notifyAccountPeers(peer.accountId, 'peer_removed', peerInfo);
}

export async function updatePeer(updateData: Partial<PeerInfo>, id?: string | ObjectId,): Promise<Peer> {
    const updatedPeer = await mcdb.updatePeerInfo(updateData, id);
    if (updatedPeer) {
        const peerInfo = peerToPeerInfo(updatedPeer);
        await notifyAccountPeers(updatedPeer.accountId, 'peer_added', peerInfo);
    } else {
        throw CustomError.validationSingle('id', 'Peer not found');
    }
    return updatedPeer;
}

export async function verifyLink({ requestId, pin }: AccountLinkVerifyRequest): Promise<AccountLinkVerifyResponse> {
    const cacheKey = `linkRequest_${requestId}`;
    const data = await globalComms.getKV(cacheKey);
    if (!data) {
        throw CustomError.validationSingle('requestId', 'Invalid or expired link request');
    }

    const waitingLink: WaitingLink = JSON.parse(data);
    if (waitingLink.pin) {
        if (!pin || waitingLink.pin !== pin) {
            throw CustomError.validationSingle('pin', 'Invalid PIN');
        }
    }

    const account = await mcdb.getAccountById(waitingLink.accountId);
    if (!account) {
        throw CustomError.validationSingle('requestId', 'Associated account not found');
    }

    // Create peer if needed
    let peer = await mcdb.getPeerByFingerprint(waitingLink.fingerprint);
    if (!peer) {
        if (!waitingLink.peerInfo) {
            throw CustomError.validationSingle('peerInfo', 'peerInfo must be provided for new peers');
        }
        peer = await createPeer(waitingLink.accountId, waitingLink.peerInfo);
    } else {
        // If peer exists but linked to different account, re-link it by deleting old record and recreating with new account id
        if (objectIdtoStr(peer.accountId) !== waitingLink.accountId) {
            if (!waitingLink.peerInfo) {
                throw CustomError.validationSingle('peerInfo', 'peerInfo must be provided for re-linking peers');
            }
            await removePeer(peer);
            peer = await createPeer(waitingLink.accountId, waitingLink.peerInfo);
        }
    }

    if (!peer) {
        throw CustomError.generic('Failed to create peer');
    }

    // Generate auth token
    const tokenData: TokenType = {
        peerId: objectIdtoStr(peer._id),
        accountId: waitingLink.accountId,
    };
    const authToken = generateJwtToken(tokenData);
    const tokenExpiry = Date.now() + 60 * 24 * 60 * 60 * 1000; // 60 days

    // Clean up cache
    await globalComms.deleteKV(cacheKey);

    return {
        accountId: objectIdtoStr(account._id),
        authToken,
        tokenExpiry,
        email: account.email,
    };
}

export async function peerExistsCached(peerId: string) {
    const cacheKey = `peerExists_${peerId}`;
    const cachedValue = await globalComms.getKV(cacheKey);
    if (cachedValue !== null) {
        return cachedValue === 'true';
    }

    const peer = await mcdb.peerExists(peerId);
    const exists = peer !== null;

    // Cache the result
    await globalComms.setKV(cacheKey, exists.toString());

    return exists;
}


export async function authenticate(token: string): Promise<TokenType> {
    try {
        const tokenData = verifyJwtToken(token);
        const exists = await peerExistsCached(tokenData.peerId);
        if (!exists) {
            throw new Error('Peer does not exist');
        }
        return tokenData;
    } catch (e: any) {
        throw CustomError.security(e.message || 'Invalid token');
    }
}

export async function linkPeer(payload: AccountLinkRequest) {
    // Make sure the payload is not expired
    const currentTime = Date.now();
    if (payload.expireAt < currentTime) {
        throw CustomError.security('Link request has expired');
    }
    // todo: validate nonce to prevent replay attacks
    const valid = verifySignature(payload.data, payload.signature, payload.publicKeyPem);
    if (!valid) {
        throw CustomError.security('Invalid signature');
    }
    const fingerprintFromPK = getFingerprintFromPem(payload.publicKeyPem);
    const schemaValidation = AccountLinkSignedPayloadSchema.safeParse(JSON.parse(payload.data));
    if (!schemaValidation.success) {
        throw CustomError.validationSingle('data', 'Invalid payload structure');
    }
    const signedPayload = schemaValidation.data;
    if (signedPayload.fingerprint !== fingerprintFromPK) {
        throw CustomError.security('Fingerprint does not match public key');
    }
    return linkAccount(signedPayload);
}

export async function getPeersForAccount(accountId: string | ObjectId): Promise<PeerInfo[]> {
    const peers = await mcdb.getPeersForAccount(accountId);
    return peers.map(peerToPeerInfo);
}

export async function assertAccountPeer(accountId: string | ObjectId, fingerprint: string): Promise<Peer> {
    const peer = await mcdb.getPeerForAccount(accountId, fingerprint);
    if (!peer) {
        throw CustomError.security('Peer not found for this account with the given fingerprint');
    }
    return peer;
}

export async function assertPeerById(peerId: string | ObjectId): Promise<Peer> {
    const peer = await mcdb.getPeerById(peerId);
    if (!peer) {
        throw CustomError.security('Peer not found with the given id');
    }
    return peer;
}

type WebcInitCache = {
    targetFingerprint: string;
    targetId: string;
    targetPin: string;
}

export async function createWebcInit(sourcePeerId: string | ObjectId, remotePeer: Peer): Promise<WebcInit> {
    const sourceFingerprint = await mcdb.getPeerFingerprint(sourcePeerId);
    if (!sourceFingerprint) {
        throw new Error('Source peer fingerprint not found');
    }
    // create 2 webc init objects: one for source peer, one for remote peer
    // return the one for source peer and send the other to remote peer via globalComms
    const initForSource: WebcInit = {
        fingerprint: remotePeer.fingerprint,
        pin: code(8),
        serverPort: UDP_PORT,
    };
    const initForRemote: WebcInit = {
        fingerprint: sourceFingerprint,
        pin: code(8),
        serverPort: UDP_PORT,
    };
    // First store the init infos in globalComms for udp service to pick up
    const sourcePeerCache: WebcInitCache = {
        targetFingerprint: remotePeer.fingerprint,
        targetId: objectIdtoStr(remotePeer._id),
        targetPin: initForRemote.pin,
    };
    const remotePeerCache: WebcInitCache = {
        targetFingerprint: sourceFingerprint,
        targetId: objectIdtoStr(sourcePeerId),
        targetPin: initForSource.pin,
    };
    await globalComms.setKV(`webc_init_${initForSource.pin}`, JSON.stringify(sourcePeerCache), 5 * 60); // 5 mins expiry
    await globalComms.setKV(`webc_init_${initForRemote.pin}`, JSON.stringify(remotePeerCache), 5 * 60); // 5 mins expiry
    // Send init to remote peer
    await notifyPeer(remotePeer._id, 'webc_request', initForRemote);
    return initForSource;
}

export async function relayWebcPeerData(pin: string, address: string, port: number): Promise<void> {
    const isRelayed = await globalComms.getKV(`webc_relayed_${pin}`);
    if (isRelayed) {
        // already relayed once
        return;
    }
    const data = await globalComms.getKV(`webc_init_${pin}`);
    if (!data) {
        throw new Error('Invalid PIN.');
    }
    const { targetId, targetPin } = JSON.parse(data) as WebcInitCache;

    // Check if the other peer has already relayed their data
    // If their IP is the same as this peer's IP, reject as loopback (same network)
    const otherPeerAddress = await globalComms.getKV(`webc_relayed_${targetPin}`);
    const isLoopback = otherPeerAddress === address;

    // Clean up cache to prevent retriggering
    await globalComms.deleteKV(`webc_init_${pin}`);
    // Set up a short-lived cache flag for idempotency, store the IP address for loopback detection
    await globalComms.setKV(`webc_relayed_${pin}`, address, 2 * 60); // 2 mins

    if (isLoopback) {
        const rejectMessage: WebcReject = {
            pin: targetPin,
            message: 'Network not supported.',
        };
        console.log(`Rejecting WebC peer data PIN=${pin} due to loopback`, rejectMessage);
        await notifyPeer(targetId, 'webc_reject', rejectMessage);
        throw new Error('Network not supported.');
    }

    const message: WebcPeerData = {
        pin: targetPin,
        peerAddress: address,
        peerPort: port,
    };
    console.log(`Relaying WebC peer data PIN=${pin}`, message);
    await notifyPeer(targetId, 'webc_peer_data', message);
}
