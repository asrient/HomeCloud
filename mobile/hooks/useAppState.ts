import { useCallback, useMemo, useRef } from 'react'
import { SignalNodeRef } from 'shared/signals'
import { ConnectionInfo, DeviceInfo, PeerInfo, SignalEvent } from 'shared/types'
import { create } from 'zustand'
import { useAccountState } from './useAccountState'

export interface AppState {
    connections: ConnectionInfo[];
    peers: PeerInfo[];
    selectedFingerprint: string | null;
    isInitialized: boolean;
    isOnboarded: boolean;
    filesViewMode: 'grid' | 'list';
    deviceInfo: DeviceInfo | null;
    instanceKey: string;

    initializeStore: (peers: PeerInfo[], connections: ConnectionInfo[], deviceInfo: DeviceInfo, isOnboarded: boolean) => void;
    selectDevice: (fingerprint: string | null) => void;
    addPeer: (peer: PeerInfo) => void;
    removePeer: (fingerprint: string) => void;
    addConnection: (connection: ConnectionInfo) => void;
    removeConnection: (fingerprint: string) => void;
    setFilesViewMode: (mode: 'grid' | 'list') => void;
    setOnboarded: (value: boolean) => void;
}

const useAppStore = create<AppState>((set) => ({
    connections: [],
    peers: [],
    selectedFingerprint: null,
    isInitialized: false,
    isOnboarded: false,
    filesViewMode: 'grid',
    deviceInfo: null,
    instanceKey: 'mobile',
    initializeStore: (peers, connections, deviceInfo, isOnboarded) => set(() => ({
        isInitialized: true,
        peers,
        connections,
        deviceInfo,
        isOnboarded,
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
    setFilesViewMode: (mode: 'grid' | 'list') => set(() => ({
        filesViewMode: mode,
    })),
    setOnboarded: (value: boolean) => set(() => ({
        isOnboarded: value,
    })),
}));

export function useAppState() {
    const {
        isInitialized,
        isOnboarded,
        peers,
        connections,
        selectedFingerprint,
        initializeStore,
        selectDevice,
        addPeer,
        removePeer,
        addConnection,
        removeConnection,
        filesViewMode,
        setFilesViewMode,
        setOnboarded,
        deviceInfo,
        instanceKey,
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
        const deviceInfo = await localSc.system.getDeviceInfo();
        initializeStore(peers, connections, deviceInfo, localSc.app.isOnboarded());

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
        }
        if (peerSignalRef.current) {
            localSc.app.peerSignal.detach(peerSignalRef.current);
            peerSignalRef.current = null;
        }
        if (connectionSignalRef.current) {
            localSc.net.connectionSignal.detach(connectionSignalRef.current);
            connectionSignalRef.current = null;
        }
        // Always reset so loadAppState can re-initialize (e.g. after React strict mode cleanup)
        loadingStateRef.current = 'initial';
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

    const selectedPeer = peers.find(peer => peer.fingerprint === selectedFingerprint) || null;

    const selectedPeerConnection: ConnectionInfo | null = useMemo(() => {
        if (!selectedFingerprint) return null;
        return connections.find(conn => conn.fingerprint === selectedFingerprint) || null;
    }, [connections, selectedFingerprint]);

    return {
        isInitialized,
        isOnboarded,
        setOnboarded,
        peers,
        connections,
        selectDevice,
        selectedFingerprint,
        loadAppState,
        clearSignals,
        selectedPeer,
        selectedPeerConnection,
        filesViewMode,
        setFilesViewMode,
        deviceInfo,
        instanceKey,
    };
}
