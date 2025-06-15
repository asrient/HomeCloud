import React, { useEffect, useRef } from 'react';
import { reducer, initialAppState, AppContext, DispatchContext, ActionTypes } from '../lib/state';
import { useImmerReducer } from 'use-immer';
import { setupStaticConfig } from '@/lib/staticConfig';
import { useAppDispatch } from './hooks/useAppState';

function WithInitialState({ children }: {
    children: React.ReactNode;
}) {
    const dispatch = useAppDispatch();
    const loadingStateRef = useRef<'initial' | 'loading' | 'loaded'>('initial');
    const bindingRef = useRef<any | null>(null);

    useEffect(() => {
        if (!(window as any).modules) {
            console.error("Modules not loaded.");
            dispatch(ActionTypes.ERROR, "Modules not loaded.");
            return;
        }
        const localSc = (window as any).modules.getLocalServiceController();
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
                bindingRef.current ?? localSc.readyStateSignal.detach(bindingRef.current);
                if (ready) {
                    dispatch(ActionTypes.INITIALIZE, {});
                } else {
                    dispatch(ActionTypes.ERROR, "Service controller is not ready");
                }
            });
        }
        if (loadingStateRef.current === 'initial') {
            if (localSc && localSc.readyState) {
                console.log("Service controller is already up:", localSc.readyState);
                // If the service controller is already ready, we can initialize immediately
                dispatch(ActionTypes.INITIALIZE, {});
            } else {
                // Otherwise, wait for the service controller to signal readiness
                console.log("Waiting for service controller to be ready...");
                waitForReadySignal();
            }
        }
    }, [dispatch]);
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
