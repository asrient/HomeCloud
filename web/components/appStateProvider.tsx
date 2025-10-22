import React, { useEffect, useRef, useCallback } from 'react';
import { reducer, initialAppState, AppContext, DispatchContext, ActionTypes } from '../lib/state';
import { useImmerReducer } from 'use-immer';
import { setupStaticConfig } from '@/lib/staticConfig';
import { useAppDispatch } from './hooks/useAppState';
import { ConnectionInfo, PeerInfo } from 'shared/types';
import { SignalNodeRef } from 'shared/signals';
import { SignalEvent } from '@/lib/enums';
import { rgbHexToHsl, setPrimaryColorHsl } from '@/lib/utils';

function WithInitialState({ children }: {
    children: React.ReactNode;
}) {
    const dispatch = useAppDispatch();
    const loadingStateRef = useRef<'initial' | 'loading' | 'loaded'>('initial');
    const bindingRef = useRef<SignalNodeRef<[boolean], string> | null>(null);
    const peerSignalRef = useRef<SignalNodeRef<[SignalEvent, PeerInfo], string> | null>(null);
    const connectionSignalRef = useRef<SignalNodeRef<[SignalEvent, ConnectionInfo], string> | null>(null);
    const accentColorSignalRef = useRef<SignalNodeRef<[string], string> | null>(null);

    const initializeApp = useCallback(async () => {
        console.log("Initializing app state...");
        const localSc = window.modules.getLocalServiceController();
        const peers = localSc.app.getPeers();
        const connections = await localSc.net.getConnectedDevices();
        const accentColor = localSc.system.getAccentColorHex();
        console.log('Accent color:', accentColor);
        setPrimaryColorHsl(...rgbHexToHsl(accentColor));
        dispatch(ActionTypes.INITIALIZE, {
            peers,
            connections,
        });

        // Setup signals

        accentColorSignalRef.current = localSc.system.accentColorChangeSignal.add((newColor: string) => {
            console.log("Accent color changed:", newColor);
            setPrimaryColorHsl(...rgbHexToHsl(newColor));
        });

        peerSignalRef.current = localSc.app.peerSignal.add((event: SignalEvent, peer: PeerInfo) => {
            console.log("Peer signal received:", event, peer);
            if (event === SignalEvent.ADD) {
                dispatch(ActionTypes.ADD_PEER, peer);
            } else if (event === SignalEvent.REMOVE) {
                dispatch(ActionTypes.REMOVE_PEER, peer);
            } else if (event === SignalEvent.UPDATE) {
                dispatch(ActionTypes.UPDATE_PEER, peer);
            }
        });

        connectionSignalRef.current = localSc.net.connectionSignal.add((event: SignalEvent, connection: ConnectionInfo) => {
            console.log("Connection signal received:", event, connection);
            if (event === SignalEvent.ADD) {
                dispatch(ActionTypes.ADD_CONNECTION, connection);
            } else if (event === SignalEvent.REMOVE) {
                dispatch(ActionTypes.REMOVE_CONNECTION, connection);
            }
        });
    }, [dispatch]);

    const clearSignals = useCallback(() => {
        console.log("Clearing signals...");
        const localSc = window.modules.getLocalServiceController();
        if (bindingRef.current) {
            localSc.readyStateSignal.detach(bindingRef.current);
            bindingRef.current = null;
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
        if (accentColorSignalRef.current) {
            localSc.system.accentColorChangeSignal.detach(accentColorSignalRef.current);
            accentColorSignalRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!window.modules) {
            console.error("Modules not loaded.");
            dispatch(ActionTypes.ERROR, "Modules not loaded.");
            return;
        }
        const localSc = window.modules.getLocalServiceController();
        const waitForReadySignal = async () => {
            console.log("waitForReadySignal");
            if (loadingStateRef.current === 'loading') {
                console.warn("Already waiting for service controller to be ready.");
                return;
            }
            loadingStateRef.current = 'loading';
            bindingRef.current = localSc.readyStateSignal.add((ready: boolean) => {
                console.log("Service controller is ready:", ready);
                loadingStateRef.current = 'loaded';
                // Detach the binding to avoid memory leaks
                if (bindingRef.current !== null) localSc.readyStateSignal.detach(bindingRef.current);
                if (ready) {
                    initializeApp();
                } else {
                    dispatch(ActionTypes.ERROR, "Service controller is not ready");
                }
            });
        }
        console.log('current loading state:', loadingStateRef.current);
        if (loadingStateRef.current === 'initial') {
            if (localSc && localSc.readyState) {
                console.log("Service controller is already up:", localSc.readyState);
                // If the service controller is already ready, we can initialize immediately
                initializeApp();
                loadingStateRef.current = 'loaded';
            } else {
                // Otherwise, wait for the service controller to signal readiness
                console.log("Waiting for service controller to be ready...");
                waitForReadySignal();
            }
        }
        return clearSignals;
    }, [clearSignals, dispatch, initializeApp]);
    return children;
}

// Define the provider component that will wrap the child components and provide the context object
export default function AppStateProvider({ children }: {
    children: React.ReactNode;
}) {
    const [state, dispatch] = useImmerReducer(reducer, initialAppState);

    useEffect(() => {
        setupStaticConfig();
    }, []);

    return (
        <AppContext.Provider value={state}>
            <DispatchContext.Provider value={dispatch}>
                <WithInitialState>
                    {children}
                </WithInitialState>
            </DispatchContext.Provider>
        </AppContext.Provider>
    );
};
