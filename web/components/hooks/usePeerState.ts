import { PeerInfo, ConnectionInfo } from 'shared/types'
import { useEffect, useMemo, useState } from 'react'
import { PeerState } from '@/lib/types'
import { useAppState } from './useAppState';

export const usePeerState = () => {
    const { peers, connections } = useAppState();

    return useMemo(() => {
        const peerMap: Record<string, PeerState> = {};

        peers.forEach((peer: PeerInfo) => {
            peerMap[peer.fingerprint] = {
                ...peer,
                connection: null,
            };
        });

        connections.forEach((connection: ConnectionInfo) => {
            if (peerMap[connection.fingerprint]) {
                peerMap[connection.fingerprint].connection = connection;
            }
        });

        return Object.values(peerMap);
    }, [peers, connections]);
}

export const usePeerConnectionState = (fingerprint: string | null) => {
    const { connections } = useAppState();
    return useMemo(() => {
        if (!fingerprint) return null;
        return connections.find(conn => conn.fingerprint === fingerprint) || null;
    }, [connections, fingerprint]);
}

export const usePeer = (fingerprint: string | null) => {
    const { peers } = useAppState();
    const [peer, setPeer] = useState<PeerInfo | null>(null);

    useEffect(() => {
        const fetchPeer = async () => {
            if (!fingerprint) {
                const localPeer = await window.modules.getLocalServiceController().app.peerInfo();
                setPeer(localPeer);
            } else {
                const foundPeer = peers.find(p => p.fingerprint === fingerprint);
                setPeer(foundPeer || null);
            }
        };

        fetchPeer();
    }, [fingerprint, peers]);
    return peer;
}
