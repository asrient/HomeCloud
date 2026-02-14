import globalComms from "./globalComms";
import { EventSchema, WebSocketEventSchema } from "./schema";
import { WebSocketEvent } from "./types";
import { WebSocket } from "ws";
import { authenticate, notifyAccountPeers } from "./lib";
import { IncomingMessage } from "http";
import mcdb from "./db";

const PEER_ONLINE_EXPIRY = 3 * 60; // 3 minutes expiry for online status
const PING_TIMEOUT = 3 * 60 * 1000; // 3 minutes timeout for no ping

export async function setPeerOnline(peerId: string): Promise<void> {
    await globalComms.setKV(`peer_online_${peerId}`, 'true', PEER_ONLINE_EXPIRY);
}

export async function setPeerOffline(peerId: string): Promise<void> {
    await globalComms.deleteKV(`peer_online_${peerId}`);
}

export async function isPeerOnline(peerId: string): Promise<boolean> {
    const status = await globalComms.getKV(`peer_online_${peerId}`);
    return status === 'true';
}

export async function startPeerDispatch(ws: WebSocket, req: IncomingMessage) {
    let accountId: string;
    let peerId: string;
    let fingerprint: string | null = null;

    const getFingerprint = async () => {
        if (fingerprint) {
            return fingerprint;
        }
        // lazy load fingerprint
        fingerprint = await mcdb.getPeerFingerprint(peerId);
        return fingerprint;
    };

    let token = req.headers['sec-websocket-protocol'] || '';

    if (typeof token === 'string' && token.startsWith('tok-')) {
        token = token.slice(4);
    } else {
        ws.close();
        return;
    }

    try {
        const tokenData = await authenticate(token);
        accountId = tokenData.accountId;
        peerId = tokenData.peerId;
    } catch (e) {
        console.log('Authentication failed for websocket connection. Closing connection.');
        ws.close();
        return;
    }

    const handleEvent = async (data: string) => {
        if (ws.readyState !== WebSocket.OPEN) {
            return;
        }
        try {
            const parsed = JSON.parse(data);
            const validation = EventSchema.safeParse(parsed);
            if (!validation.success) {
                console.error('Invalid event data:', validation.error);
                return;
            }
            const evName = validation.data.type as WebSocketEvent;
            // make sure to only send events meant for websockets
            if (!WebSocketEventSchema.options.includes(evName)) {
                console.error('Unsupported websocket event type:', evName);
                return;
            }
            // Process the validated event data
            ws.send(JSON.stringify(validation.data));
            // case handle: self peer removal
            if (evName === 'peer_removed') {
                const eventData = validation.data.data;
                if (eventData.fingerprint !== await getFingerprint()) {
                    return;
                }
                console.log('Peer has been removed. Closing websocket connection.');
                ws.close();
            }
        } catch (e) {
            console.error('Error parsing dispatched event data:', e);
        }
    };

    ws.on('message', async function message(data) {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'ping') {
                // Refresh online status and reset timeout
                await setPeerOnline(peerId);
                resetPingTimeout();
            }
        } catch (e) {
            // Ignore invalid messages
        }
    });

    ws.on('close', function close() {
        console.log('Client disconnected');
        !!peerId && setPeerOffline(peerId);
        !!peerId && globalComms.unsubscribeEvent(`peer_${peerId}`, handleEvent);
        !!accountId && globalComms.unsubscribeEvent(`account_${accountId}`, handleEvent);
        if (pingTimeoutTimer) {
            clearTimeout(pingTimeoutTimer);
        }
    });

    ws.on('error', function error(err) {
        console.error('WebSocket error:', err);
        if (ws.readyState !== WebSocket.OPEN) {
            return;
        }
        ws.close();
    });

    globalComms.subscribeEvent(`peer_${peerId}`, handleEvent);
    globalComms.subscribeEvent(`account_${accountId}`, handleEvent);

    // Mark peer as online and notify other peers in the account
    await setPeerOnline(peerId);
    const fp = await getFingerprint();
    if (fp) {
        console.log(`Peer ${peerId} is online with fingerprint ${fp}. Notifying account peers.`);
        notifyAccountPeers(accountId, 'peer_online', { fingerprint: fp });
    } else {
        console.warn(`Peer ${peerId} is online but has no fingerprint.`);
    }

    // Set up ping timeout - close connection if no ping received within timeout period
    let pingTimeoutTimer: NodeJS.Timeout | null = null;

    const resetPingTimeout = () => {
        if (pingTimeoutTimer) {
            clearTimeout(pingTimeoutTimer);
        }
        pingTimeoutTimer = setTimeout(() => {
            console.log('No ping received from client, closing connection');
            ws.close();
        }, PING_TIMEOUT);
    };

    // Start initial timeout
    resetPingTimeout();
}
