import { Dispatch, createContext } from 'react';

export type AppStateType = {
    isInitalized: boolean;
    appError: string | null;
    showSidebar: boolean;
};

export enum ActionTypes {
    INITIALIZE = 'INITIALIZE',
    ERROR = 'ERROR',
    TOGGLE_SIDEBAR = 'TOGGLE_SIDEBAR',
}

export type AppDispatchType = {
    type: ActionTypes;
    payload: any;
}

// Initial state of the context
export const initialAppState: AppStateType = {
    isInitalized: false,
    appError: null,
    showSidebar: true,
};

export const AppContext = createContext<AppStateType>(initialAppState);
export const DispatchContext = createContext<Dispatch<AppDispatchType> | null>(null);

export function reducer(draft: AppStateType, action: AppDispatchType) {
    const { type, payload } = action;
    switch (type) {
        case ActionTypes.INITIALIZE: {
            draft.isInitalized = true;
            draft.appError = null;
            return draft;
        }
        case ActionTypes.ERROR: {
            draft.appError = payload;
            return draft;
        }
        case ActionTypes.TOGGLE_SIDEBAR: {
            const { showSidebar }: {
                showSidebar: boolean;
            } = payload;
            draft.showSidebar = showSidebar || !draft.showSidebar;
            return draft;
        }
        default:
            console.error('Unknown action type:', type);
            return draft;
    }
}
