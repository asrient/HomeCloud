import globalComms from "./globalComms";
import { EventSchema, WebSocketEventSchema } from "./schema";
import { WebSocketEvent } from "./types";
import { WebSocket } from "ws";
import { authenticate } from "./lib";
import { IncomingMessage } from "http";
import mcdb from "./db";

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

    ws.on('message', function message(data) {
        // ignoring messages from clients for now.
    });

    ws.on('close', function close() {
        console.log('Client disconnected');
        !!peerId && globalComms.unsubscribeEvent(`ws_peer_${peerId}`, handleEvent);
        !!accountId && globalComms.unsubscribeEvent(`ws_account_${accountId}`, handleEvent);
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
}
