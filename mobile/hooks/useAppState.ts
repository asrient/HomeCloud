import { useCallback, useRef } from 'react'
import { SignalNodeRef } from 'shared/signals'
import { ConnectionInfo, PeerInfo, SignalEvent } from 'shared/types'
import { create } from 'zustand'
import { useAccountState } from './useAccountState'

export interface AppState {
    connections: ConnectionInfo[];
    peers: PeerInfo[];
    selectedFingerprint: string | null;
    isInitialized: boolean;

    initializeStore: (peers: PeerInfo[], connections: ConnectionInfo[]) => void;
    selectDevice: (fingerprint: string | null) => void;
    addPeer: (peer: PeerInfo) => void;
    removePeer: (fingerprint: string) => void;
    addConnection: (connection: ConnectionInfo) => void;
    removeConnection: (fingerprint: string) => void;
}

const useAppStore = create<AppState>((set) => ({
    connections: [],
    peers: [],
    selectedFingerprint: null,
    isInitialized: false,
    initializeStore: (peers, connections) => set(() => ({
        isInitialized: true,
        peers,
        connections,
    })),
    selectDevice: (fingerprint) => set(() => ({
        selectedFingerprint: fingerprint,
    })),
    addPeer: (peer) => set((state) => {
        // If already exists, update it
        const existingIndex = state.peers.findIndex(p => p.fingerprint === peer.fingerprint);
        if (existingIndex !== -1) {
            const updatedPeers = [...state.peers];
            updatedPeers[existingIndex] = peer;
            return {
                peers: updatedPeers,
            };
        }
        return {
            peers: [...state.peers, peer],
        };
    }),
    removePeer: (fingerprint) => set((state) => ({
        peers: state.peers.filter(peer => peer.fingerprint !== fingerprint),
    })),
    addConnection: (connection) => set((state) => ({
        connections: [...state.connections, connection],
    })),
    removeConnection: (fingerprint) => set((state) => ({
        connections: state.connections.filter(conn => conn.fingerprint !== fingerprint),
    })),
}));

export function useAppState() {
    const {
        isInitialized,
        peers,
        connections,
        selectedFingerprint,
        initializeStore,
        selectDevice,
        addPeer,
        removePeer,
        addConnection,
        removeConnection
    } = useAppStore();
    const loadingStateRef = useRef<'initial' | 'loading' | 'loaded'>('initial');
    const readySignalRef = useRef<SignalNodeRef<[boolean], string> | null>(null);
    const peerSignalRef = useRef<SignalNodeRef<[SignalEvent, PeerInfo], string> | null>(null);
    const connectionSignalRef = useRef<SignalNodeRef<[SignalEvent, ConnectionInfo], string> | null>(null);
    const { setupAccountState, clearAccountState } = useAccountState(); 

    const initializeAppState = useCallback(async () => {
        console.log("Initializing app state...");
        const localSc = modules.getLocalServiceController();
        const peers = localSc.app.getPeers();
        const connections = await localSc.net.getConnectedDevices();

        initializeStore(peers, connections);

        // Account state
        setupAccountState();

        // Setup signals

        peerSignalRef.current = localSc.app.peerSignal.add((event: SignalEvent, peer: PeerInfo) => {
            console.log("Peer signal received:", event, peer);
            if (event === SignalEvent.ADD) {
                addPeer(peer);
            } else if (event === SignalEvent.REMOVE) {
                removePeer(peer.fingerprint);
            } else if (event === SignalEvent.UPDATE) {
                addPeer(peer); // Reuse addPeer for update
            }
        });

        connectionSignalRef.current = localSc.net.connectionSignal.add((event: SignalEvent, connection: ConnectionInfo) => {
            console.log("Connection signal received:", event, connection);
            if (event === SignalEvent.ADD) {
                addConnection(connection);
            } else if (event === SignalEvent.REMOVE) {
                removeConnection(connection.fingerprint);
            }
        });

        // Open onboarding if required
        // if (localSc.app.isOnboarded() === false) {
        //     console.log("App is not onboarded, opening onboarding dialog...");
        //     // openDialog('welcome');
        // }
    }, [addConnection, addPeer, initializeStore, removeConnection, removePeer, setupAccountState]);

    const clearSignals = useCallback(() => {
        console.log("Clearing signals...");
        const localSc = modules.getLocalServiceController();
        if (readySignalRef.current) {
            localSc.readyStateSignal.detach(readySignalRef.current);
            readySignalRef.current = null;
            if (loadingStateRef.current === 'loading') {
                loadingStateRef.current = 'initial';
            }
        }
        if (peerSignalRef.current) {
            localSc.app.peerSignal.detach(peerSignalRef.current);
            peerSignalRef.current = null;
        }
        if (connectionSignalRef.current) {
            localSc.net.connectionSignal.detach(connectionSignalRef.current);
            connectionSignalRef.current = null;
        }
        clearAccountState();
    }, [clearAccountState]);

    const loadAppState = useCallback(() => {
        if (loadingStateRef.current === 'initial') {
            console.log("Loading app state...");
            const localSc = modules.getLocalServiceController();
            loadingStateRef.current = 'loading';
            if (localSc.readyState === true) {
                initializeAppState().then(() => {
                    loadingStateRef.current = 'loaded';
                });
            }
            readySignalRef.current = localSc.readyStateSignal.add((isReady: boolean) => {
                console.log("Ready state signal received:", isReady);
                if (isReady) {
                    initializeAppState().then(() => {
                        loadingStateRef.current = 'loaded';
                    }).finally(() => {
                        readySignalRef.current && localSc.readyStateSignal.detach(readySignalRef.current);
                        readySignalRef.current = null;
                    });
                }
            });
        }
    }, [initializeAppState]);

    return {
        isInitialized,
        peers,
        connections,
        selectDevice,
        selectedFingerprint,
        loadAppState,
        clearSignals,
    };
}
