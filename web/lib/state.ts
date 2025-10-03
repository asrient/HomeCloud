import { Dispatch, createContext } from 'react';
import { PeerInfo, ConnectionInfo } from 'shared/types';

export type AppStateType = {
    isInitalized: boolean;
    appError: string | null;
    peers: PeerInfo[];
    connections: ConnectionInfo[];
    selectedFingerprint: string | null;
};

export enum ActionTypes {
    INITIALIZE = 'INITIALIZE',
    ERROR = 'ERROR',
    ADD_PEER = 'ADD_PEER',
    REMOVE_PEER = 'REMOVE_PEER',
    UPDATE_PEER = 'UPDATE_PEER',
    ADD_CONNECTION = 'ADD_CONNECTION',
    REMOVE_CONNECTION = 'REMOVE_CONNECTION',
    SELECT_DEVICE = 'SELECT_DEVICE',
}

export type AppDispatchType = {
    type: ActionTypes;
    payload: any;
}

// Initial state of the context
export const initialAppState: AppStateType = {
    isInitalized: false,
    appError: null,
    peers: [],
    connections: [],
    selectedFingerprint: null,
};

export const AppContext = createContext<AppStateType>(initialAppState);
export const DispatchContext = createContext<Dispatch<AppDispatchType> | null>(null);

export function reducer(draft: AppStateType, action: AppDispatchType) {
    const { type, payload } = action;
    switch (type) {
        case ActionTypes.INITIALIZE: {
            draft.isInitalized = true;
            draft.appError = null;
            draft.peers = payload.peers || [];
            draft.connections = payload.connections || [];
            return draft;
        }
        case ActionTypes.ERROR: {
            draft.appError = payload;
            return draft;
        }
        case ActionTypes.ADD_PEER: {
            draft.peers.push(payload);
            return draft;
        }
        case ActionTypes.REMOVE_PEER: {
            const removedPeer = payload;
            draft.peers = draft.peers.filter(peer => peer.fingerprint !== removedPeer.fingerprint);
            return draft;
        }
        case ActionTypes.UPDATE_PEER: {
            const updatedPeer = payload;
            const index = draft.peers.findIndex(peer => peer.fingerprint === updatedPeer.fingerprint);
            if (index !== -1) {
                draft.peers[index] = { ...draft.peers[index], ...updatedPeer };
            }
            return draft;
        }
        case ActionTypes.ADD_CONNECTION: {
            draft.connections.push(payload);
            return draft;
        }
        case ActionTypes.REMOVE_CONNECTION: {
            const removedConnection = payload;
            draft.connections = draft.connections.filter(conn => conn.fingerprint !== removedConnection.fingerprint);
            return draft;
        }
        case ActionTypes.SELECT_DEVICE: {
            const { fingerprint }: { fingerprint: string | null } = payload;
            draft.selectedFingerprint = fingerprint;
            return draft;
        }
        default:
            console.error('Unknown action type:', type);
            return draft;
    }
}
