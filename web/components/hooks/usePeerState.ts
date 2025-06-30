import { PeerInfo, ConnectionInfo } from 'shared/types'
import { useMemo } from 'react'
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
