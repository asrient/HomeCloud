import { Router } from 'express';
import { getFn, getTokenContextOrThrow, postFn } from './expressHelper';
import { assertAccountPeer, createWebcInit, getPeersForAccount, healthCheck, linkPeer, removePeer, updatePeer, verifyLink } from './lib';
import { AccountLinkRequest, AccountLinkVerifyRequest, PeerInfo, PeerFingerprint } from './types';
import { AccountLinkRequestSchema, AccountLinkVerifyRequestSchema, PeerInfoSchema, PeerFingerprintSchema } from './schema';
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

appRouter.post('/peer/remove', postFn<PeerFingerprint>(async (data, req) => {
    const { accountId } = getTokenContextOrThrow(req);
    const peer = await assertAccountPeer(accountId, data.fingerprint);
    return removePeer(peer);
}, PeerFingerprintSchema));

appRouter.get('/peer', getFn((data, req) => {
    const { accountId } = getTokenContextOrThrow(req);
    return getPeersForAccount(accountId);
}));

appRouter.post('/webc/init', postFn<PeerFingerprint>(async (data, req) => {
    const { accountId, peerId } = getTokenContextOrThrow(req);
    const remotePeer = await assertAccountPeer(accountId, data.fingerprint);
    return createWebcInit(peerId, remotePeer);
}, PeerFingerprintSchema));

export default appRouter;
