import React, { useEffect } from 'react';
import { reducer, initialAppState, AppContext, DispatchContext, ActionTypes } from '../lib/state';
import { useImmerReducer } from 'use-immer';
import { setupStaticConfig } from '@/lib/staticConfig';
import { initalialState } from '@/lib/api/auth';
import { useAppDispatch, useAppState } from './hooks/useAppState';
import usePinnedFolders from './hooks/usePinnedFolders';

function WithInitialState({ children }: {
    children: React.ReactNode;
}) {
    const dispatch = useAppDispatch();
    const { isAppLoaded, isInitalized } = useAppState();
    const [ isLoading, setIsLoading ] = React.useState(false);
    usePinnedFolders();

    useEffect(() => {
        async function fetchInitialState() {
            console.log("Fetching initial state");
            setIsLoading(true);
            try {
                const data = await initalialState();
                dispatch(ActionTypes.INITIALIZE, data);
            } catch (error: any) {
                console.error(error);
                dispatch(ActionTypes.ERROR, error.message);
            } finally {
                setIsLoading(false);
            }
        }
        if (isAppLoaded && !isInitalized && !isLoading) {
            fetchInitialState();
        }
    }, [dispatch, isAppLoaded, isInitalized, isLoading]);

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
    }, [dispatch]);

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
