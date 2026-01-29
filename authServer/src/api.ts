import { Router } from 'express';
import { getFn, getTokenContextOrThrow, postFn } from './expressHelper';
import { assertAccountPeer, assertPeerById, createWebcInit, getPeersForAccount, healthCheck, isPeerOnline, linkPeer, removePeer, requestPeerConnect, updatePeer, verifyLink } from './lib';
import { AccountLinkRequest, AccountLinkVerifyRequest, PeerInfo, WebcInitRequest, PeerFingerprintOptional, Peer, PeerFingerprint, PeerConnectRequest } from './types';
import { AccountLinkRequestSchema, AccountLinkVerifyRequestSchema, PeerInfoSchema, WebcInitRequestSchema, PeerFingerprintOptionalSchema, PeerFingerprintSchema, PeerConnectRequestSchema } from './schema';
import { auth, requireAuth } from './middlewares';


const appRouter = Router();

// No auth
appRouter.post('/link', postFn<AccountLinkRequest>(linkPeer, AccountLinkRequestSchema));

appRouter.post('/link-verify', postFn<AccountLinkVerifyRequest>(verifyLink, AccountLinkVerifyRequestSchema));

appRouter.get('/health', getFn(healthCheck));

// Attach auth info
appRouter.use(auth);

/* Add apis here that works with both auth and non-auth users but needs auth info.. */

// Require auth
appRouter.use(requireAuth);

appRouter.post('/peer/update', postFn<PeerInfo>(async (data, req) => {
    const { accountId } = getTokenContextOrThrow(req);
    const peer = await assertAccountPeer(accountId, data.fingerprint);
    return updatePeer(data);
}, PeerInfoSchema));

appRouter.post('/peer/remove', postFn<PeerFingerprintOptional>(async (data, req) => {
    const { accountId, peerId } = getTokenContextOrThrow(req);
    let peer: Peer;
    if (data.fingerprint) {
        peer = await assertAccountPeer(accountId, data.fingerprint);
    } else {
        peer = await assertPeerById(peerId);
    }
    return removePeer(peer);
}, PeerFingerprintOptionalSchema));

appRouter.get('/peer', getFn((data, req) => {
    const { accountId } = getTokenContextOrThrow(req);
    return getPeersForAccount(accountId);
}));

appRouter.post('/webc/init', postFn<WebcInitRequest>(async (data, req) => {
    const { accountId, peerId } = getTokenContextOrThrow(req);
    const remotePeer = await assertAccountPeer(accountId, data.fingerprint);
    return createWebcInit(peerId, remotePeer);
}, WebcInitRequestSchema));

appRouter.get('/peer/online', getFn<PeerFingerprint>(async (data, req) => {
    const { accountId } = getTokenContextOrThrow(req);
    const peer = await assertAccountPeer(accountId, data!.fingerprint);
    return isPeerOnline(peer);
}, PeerFingerprintSchema));

appRouter.post('/peer/hello', postFn<PeerConnectRequest>(async (data, req) => {
    const { accountId, peerId } = getTokenContextOrThrow(req);
    const targetPeer = await assertAccountPeer(accountId, data.fingerprint);
    return requestPeerConnect(peerId, targetPeer, data.addresses, data.port);
}, PeerConnectRequestSchema));

export default appRouter;
