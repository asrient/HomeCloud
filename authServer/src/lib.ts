import {
    Account, AccountLinkRequest, AccountLinkResponse,
    AccountLinkSignedPayload, HelloType, TokenType, PeerInfo,
    AccountLinkVerifyResponse, EventType, WebSocketEvent,
    Peer,
    AccountLinkVerifyRequest,
    WebcInit,
    WebcPeerData,
    WebcReject,
    PeerConnectRequest,
} from "./types";
import globalComms from "./globalComms";
import { ObjectId } from "mongodb";
import mcdb from "./db";
import { objectIdtoStr, verifyJwtToken, uniqueCode, generatePin, generateJwtToken, code, isSameNetwork } from "./utils";
import CustomError from "./customError";
import { getFingerprintFromPem, verifySignature } from "./signHelper";
import { AccountLinkSignedPayloadSchema } from "./schema";
import emailService from "./emailService";
import { UDP_PORT } from "./config";
import { isPeerOnline as checkPeerOnline } from "./peerDispatch";

const LOCAL_NETWORK_ERROR = 'ERR_LOCAL_NET';

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

    const deviceName = peerInfo?.deviceName || 'Your Device';

    if (requiresVerification && pin) {
        await emailService.sendEmail(account.email, `Login PIN for ${deviceName}`, `Your verification PIN is: ${pin}`);
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
            throw CustomError.security('Peer does not exist');
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

export async function createWebcInit({
    sourcePeerId,
    remotePeer,
}: {
    sourcePeerId: string | ObjectId;
    remotePeer: Peer;
}): Promise<WebcInit> {
    const sourceFingerprint = await mcdb.getPeerFingerprint(sourcePeerId);
    if (!sourceFingerprint) {
        throw CustomError.generic('Source peer fingerprint not found');
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

type WebcPendingPeer = {
    targetId: string;  // ID of the OTHER peer (to send their data to)
    pin: string;       // This peer's own PIN
    address: string;
    port: number;
}

/**
 * Relays WebC peer data between two peers.
 * 
 * Peer A: The peer that calls this function first (waits for Peer B)
 * Peer B: The peer that calls this function second (triggers the relay to both)
 * 
 * Flow:
 * 1. Peer A submits their data → stored, waits for Peer B
 * 2. Peer B submits their data → both peers' data is relayed simultaneously
 */
export async function relayWebcPeerData(pin: string, address: string, port: number): Promise<void> {
    const isRelayed = await globalComms.getKV(`webc_relayed_${pin}`);
    if (isRelayed) {
        // already relayed once
        return;
    }
    const data = await globalComms.getKV(`webc_init_${pin}`);
    if (!data) {
        throw CustomError.generic('Invalid PIN.');
    }
    const { targetId, targetPin } = JSON.parse(data) as WebcInitCache;

    // Current peer's data (will be Peer A if first, Peer B if second)
    const currentPeer: WebcPendingPeer = {
        targetId, // ID of the OTHER peer (to send this peer's data to)
        pin,
        address,
        port,
    };
    await globalComms.setKV(`webc_pending_${pin}`, JSON.stringify(currentPeer), 2 * 60); // 2 mins expiry

    // Clean up init cache
    await globalComms.deleteKV(`webc_init_${pin}`);
    // Set up a short-lived cache flag for idempotency
    await globalComms.setKV(`webc_relayed_${pin}`, 'true', 2 * 60); // 2 mins

    // Check if the other peer (Peer A) has already submitted their data
    const peerADataStr = await globalComms.getKV(`webc_pending_${targetPin}`);
    if (!peerADataStr) {
        // We are Peer A - other peer hasn't submitted yet, wait for them
        console.log(`WebC: Peer A (PIN=${pin}) stored, waiting for Peer B`);
        return;
    }

    // We are Peer B - Peer A has already submitted, now relay data to both
    const peerA = JSON.parse(peerADataStr) as WebcPendingPeer;
    const peerB: WebcPendingPeer = currentPeer;

    // Check for loopback (same network) - both peers have the same public IP
    const isSameNetwork = peerA.address === peerB.address;

    // Clean up pending caches
    await globalComms.deleteKV(`webc_pending_${peerA.pin}`);
    await globalComms.deleteKV(`webc_pending_${peerB.pin}`);

    if (isSameNetwork) {
        // Store pin mapping for relayWebcLocal to use later
        // Each pin maps to: who owns it, who the target is, and target's pin
        const cacheForPeerA: WebcLocalRelayCache = {
            peerId: peerB.targetId,      // owner of peerA.pin
            targetPeerId: peerA.targetId, // the other peer (owner of peerB.pin)
            targetPin: peerB.pin,
        };
        const cacheForPeerB: WebcLocalRelayCache = {
            peerId: peerA.targetId,      // owner of peerB.pin
            targetPeerId: peerB.targetId, // the other peer (owner of peerA.pin)
            targetPin: peerA.pin,
        };
        await globalComms.setKV(`webc_local_${peerA.pin}`, JSON.stringify(cacheForPeerA), 2 * 60); // 2 mins
        await globalComms.setKV(`webc_local_${peerB.pin}`, JSON.stringify(cacheForPeerB), 2 * 60); // 2 mins

        // Notify both peers about the rejection so they can attempt local relay
        const rejectForPeerA: WebcReject = {
            pin: peerA.pin,
            message: LOCAL_NETWORK_ERROR,
        };
        const rejectForPeerB: WebcReject = {
            pin: peerB.pin,
            message: LOCAL_NETWORK_ERROR,
        };
        console.log(`WebC: Rejecting Peer A (PIN=${peerA.pin}) and Peer B (PIN=${peerB.pin}) - same network, awaiting local relay`);
        await Promise.all([
            notifyPeer(peerB.targetId, 'webc_reject', rejectForPeerA),  // peerB.targetId = owner of peerA.pin
            notifyPeer(peerA.targetId, 'webc_reject', rejectForPeerB),  // peerA.targetId = owner of peerB.pin
        ]);
        throw CustomError.generic(LOCAL_NETWORK_ERROR);
    }

    // Send each peer the other's address info
    // peerB.targetId = owner of peerA.pin, peerA.targetId = owner of peerB.pin
    const messageForPeerA: WebcPeerData = {
        pin: peerA.pin,
        peerAddress: peerB.address,
        peerPort: peerB.port,
    };
    const messageForPeerB: WebcPeerData = {
        pin: peerB.pin,
        peerAddress: peerA.address,
        peerPort: peerA.port,
    };
    console.log(`WebC: Relaying data between Peer A (PIN=${peerA.pin}) and Peer B (PIN=${peerB.pin})`);
    await Promise.all([
        notifyPeer(peerB.targetId, 'webc_peer_data', messageForPeerA),  // send to owner of peerA.pin
        notifyPeer(peerA.targetId, 'webc_peer_data', messageForPeerB),  // send to owner of peerB.pin
    ]);
}

export async function isPeerOnline(peer: Peer): Promise<{ isOnline: boolean }> {
    const isOnline = await checkPeerOnline(objectIdtoStr(peer._id));
    return { isOnline };
}

type WebcLocalRelayCache = {
    peerId: string;       // owner of this pin
    targetPeerId: string; // the other peer
    targetPin: string;    // the other peer's pin
}

type WebcLocalPendingPeer = {
    peerId: string;
    targetPeerId: string;
    addresses: string[];
    port: number;
}

/**
 * Relays local network addresses between two peers on the same network.
 * 
 * Called after relayWebcPeerData detects same network (LOCAL_NETWORK_ERROR).
 * Both peers submit their local addresses, and once both have submitted,
 * we find matching network addresses and relay them to each other.
 * 
 * Peer A: The peer that calls this function first (waits for Peer B)
 * Peer B: The peer that calls this function second (triggers the relay to both)
 * 
 * @param peerId - The ID of the peer making this request (from auth token)
 * @param pin - The PIN assigned to this peer during webc init
 * @param addresses - List of local IP addresses of this peer
 * @param port - The local port this peer is listening on
 */
export async function relayWebcLocal(peerId: string, pin: string, addresses: string[], port: number): Promise<void> {
    // Check if already relayed
    const isRelayed = await globalComms.getKV(`webc_local_relayed_${pin}`);
    if (isRelayed) {
        return;
    }

    // Get the local relay cache created by relayWebcPeerData
    const cacheStr = await globalComms.getKV(`webc_local_${pin}`);
    if (!cacheStr) {
        throw CustomError.generic('Invalid or expired PIN for local relay.');
    }
    const cache = JSON.parse(cacheStr) as WebcLocalRelayCache;

    // Verify that the peerId matches the owner of this pin
    if (cache.peerId !== peerId) {
        throw CustomError.security('PIN does not belong to this peer');
    }

    // Store current peer's local data
    const currentPeer: WebcLocalPendingPeer = {
        peerId: cache.peerId,
        targetPeerId: cache.targetPeerId,
        addresses,
        port,
    };
    await globalComms.setKV(`webc_local_pending_${pin}`, JSON.stringify(currentPeer), 2 * 60); // 2 mins

    // Set idempotency flag
    await globalComms.setKV(`webc_local_relayed_${pin}`, 'true', 2 * 60); // 2 mins

    // Check if the other peer has already submitted their local data
    const otherPeerDataStr = await globalComms.getKV(`webc_local_pending_${cache.targetPin}`);
    if (!otherPeerDataStr) {
        // Other peer hasn't submitted yet, wait for them
        console.log(`WebC Local: Peer (PIN=${pin}) stored, waiting for other peer`);
        return;
    }

    // Both peers have submitted, now find matching network and relay
    const otherPeer = JSON.parse(otherPeerDataStr) as WebcLocalPendingPeer;

    // Clean up caches
    await globalComms.deleteKV(`webc_local_pending_${pin}`);
    await globalComms.deleteKV(`webc_local_pending_${cache.targetPin}`);
    await globalComms.deleteKV(`webc_local_${pin}`);
    await globalComms.deleteKV(`webc_local_${cache.targetPin}`);

    // Find the best matching address pair using isSameNetwork
    let addressForCurrentPeer: string | null = null;
    let addressForOtherPeer: string | null = null;

    for (const addrCurrent of currentPeer.addresses) {
        for (const addrOther of otherPeer.addresses) {
            if (isSameNetwork(addrCurrent, addrOther)) {
                addressForCurrentPeer = addrOther; // current peer connects to other's address
                addressForOtherPeer = addrCurrent; // other peer connects to current's address
                break;
            }
        }
        if (addressForCurrentPeer) break;
    }

    if (!addressForCurrentPeer || !addressForOtherPeer) {
        // No matching network found, reject both peers
        const rejectForCurrent: WebcReject = {
            pin: pin,
            message: 'No matching local network found.',
        };
        const rejectForOther: WebcReject = {
            pin: cache.targetPin,
            message: 'No matching local network found.',
        };
        console.log(`WebC Local: No matching network for PIN=${pin} and PIN=${cache.targetPin}`);
        await Promise.all([
            notifyPeer(currentPeer.peerId, 'webc_reject', rejectForCurrent),
            notifyPeer(otherPeer.peerId, 'webc_reject', rejectForOther),
        ]);
        throw CustomError.generic('No matching local network found.');
    }

    // Send each peer the other's local address info
    const messageForCurrent: WebcPeerData = {
        pin: pin,
        peerAddress: addressForCurrentPeer,
        peerPort: otherPeer.port,
    };
    const messageForOther: WebcPeerData = {
        pin: cache.targetPin,
        peerAddress: addressForOtherPeer,
        peerPort: currentPeer.port,
    };
    console.log(`WebC Local: Relaying between PIN=${pin} (addr=${addressForOtherPeer}) and PIN=${cache.targetPin} (addr=${addressForCurrentPeer})`);
    await Promise.all([
        notifyPeer(currentPeer.peerId, 'webc_peer_data', messageForCurrent),
        notifyPeer(otherPeer.peerId, 'webc_peer_data', messageForOther),
    ]);
}

export async function requestPeerConnect(
    sourcePeerId: string | ObjectId,
    targetPeer: Peer,
    addresses: string[],
    port: number
): Promise<void> {
    // Get source peer's fingerprint
    const sourceFingerprint = await mcdb.getPeerFingerprint(sourcePeerId);
    if (!sourceFingerprint) {
        throw CustomError.generic('Source peer fingerprint not found');
    }

    // Check if target peer is online
    const isOnline = await checkPeerOnline(objectIdtoStr(targetPeer._id));
    if (!isOnline) {
        throw CustomError.generic('Target peer is not online');
    }

    // Send connect request to target peer
    const connectRequest: PeerConnectRequest = {
        fingerprint: sourceFingerprint,
        addresses,
        port,
    };

    await notifyPeer(targetPeer._id, 'connect_request', connectRequest);
}
