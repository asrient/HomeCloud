import React, { useEffect } from 'react';
import { reducer, initialAppState, AppContext, DispatchContext, ActionTypes } from '../lib/state';
import { useImmerReducer } from 'use-immer';
import { staticConfig, setupStaticConfig } from '@/lib/staticConfig';
import { initalialState } from '@/lib/api/auth';
import { useAppDispatch, useAppState } from './hooks/useAppState';


function WithInitialState({ children }: {
    children: React.ReactNode;
}) {
    const dispatch = useAppDispatch();
    const { isAppLoaded } = useAppState();

    useEffect(() => {
        async function fetchInitialState() {
            console.log("Fetching initial state");
            try {
                const data = await initalialState();
                dispatch(ActionTypes.INITIALIZE, data);
            } catch (error: any) {
                console.error(error);
                dispatch(ActionTypes.ERROR, error.message);
            }
        }
        if (isAppLoaded) {
            fetchInitialState();
        }
    }, [isAppLoaded]);

    return children;
}

// Define the provider component that will wrap the child components and provide the context object
export default function AppStateProvider({ children }: {
    children: React.ReactNode;
}) {
    const [state, dispatch] = useImmerReducer(reducer, initialAppState);

    useEffect(() => {
        setupStaticConfig();
        dispatch({
            type: ActionTypes.APP_LOADED,
            payload: null,
        });
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
