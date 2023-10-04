import { Dispatch, createContext } from 'react';
import { Profile, ServerConfig, Storage } from './types';

export type AppStateType = {
    isInitalized: boolean;
    isAppLoaded: boolean;
    serverConfig: ServerConfig | null;
    appError: string | null;
    profile: Profile | null;
    storages: Storage[] | null;
};

export enum ActionTypes {
    INITIALIZE = 'INITIALIZE',
    ERROR = 'ERROR',
    APP_LOADED = 'APP_LOADED',
}

export type AppDispatchType = {
    type: ActionTypes;
    payload: any;
}

// Initial state of the context
export const initialAppState: AppStateType = {
    isInitalized: false,
    isAppLoaded: false,
    serverConfig: null,
    appError: null,
    profile: null,
    storages: null,
};

export const AppContext = createContext<AppStateType>(initialAppState);
export const DispatchContext = createContext<Dispatch<AppDispatchType> | null>(null);

export function reducer(draft: AppStateType, action: AppDispatchType) {
    const { type, payload } = action;
    switch (type) {
        case ActionTypes.APP_LOADED:
            draft.isAppLoaded = true;
            return draft;
        case ActionTypes.INITIALIZE:
            draft.isInitalized = true;
            draft.serverConfig = payload.config;
            draft.appError = null;
            draft.profile = payload.profile;
            draft.storages = payload.storages;
            return draft;
        case ActionTypes.ERROR:
            draft.isInitalized = true;
            draft.appError = payload;
            return draft;
        default:
            return draft;
    }
}
