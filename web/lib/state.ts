import { Dispatch, createContext } from 'react';
import { Profile, ServerConfig, Storage, StorageMeta, PinnedFolder } from './types';

export type AppStateType = {
    isInitalized: boolean;
    isAppLoaded: boolean;
    serverConfig: ServerConfig | null;
    appError: string | null;
    profile: Profile | null;
    storages: Storage[] | null;
    disabledStorages: number[];
    showSidebar: boolean;
    pinnedFolders: PinnedFolder[];
};


export enum ActionTypes {
    INITIALIZE = 'INITIALIZE',
    ERROR = 'ERROR',
    APP_LOADED = 'APP_LOADED',
    TOGGLE_STORAGE = 'DISABLE_STORAGE',
    ADD_STORAGE = 'ADD_STORAGE',
    ADD_STORAGE_META = 'ADD_STORAGE_META',
    UPDATE_STORAGE = 'UPDATE_STORAGE',
    TOGGLE_SIDEBAR = 'TOGGLE_SIDEBAR',
    SET_PINNED_FOLDERS = 'SET_PINNED_FOLDERS',
    ADD_PINNED_FOLDER = 'ADD_PINNED_FOLDER',
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
    disabledStorages: [],
    showSidebar: true,
    pinnedFolders: [],
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
            draft.disabledStorages = [];
            draft.pinnedFolders = [];
            return draft;
        case ActionTypes.ERROR:
            draft.isInitalized = true;
            draft.appError = payload;
            return draft;
        case ActionTypes.TOGGLE_STORAGE:
            const { storageId, disabled } = payload;
            if (disabled) {
                draft.disabledStorages.push(storageId);
            } else {
                draft.disabledStorages = draft.disabledStorages.filter((id) => id !== storageId);
            }
            return draft;
        case ActionTypes.ADD_STORAGE:
            const { storage }: {
                storage: Storage;
            } = payload;
            if (draft.storages) {
                const existingIndex = draft.storages.findIndex((s) => s.id === storage.id);
                if (existingIndex !== undefined && existingIndex !== -1) {
                    draft.storages[existingIndex] = storage;
                } else {
                    draft.storages.push(storage);
                }
            }
            return draft;
        case ActionTypes.ADD_STORAGE_META:
            const { storageId: id, storageMeta }: {
                storageId: number;
                storageMeta: StorageMeta;
            } = payload;
            const storageIndex = draft.storages?.findIndex((storage) => storage.id === id);
            if (draft.storages && storageIndex !== undefined && storageIndex !== -1) {
                draft.storages[storageIndex].storageMeta = storageMeta;
            }
            return draft;
        case ActionTypes.UPDATE_STORAGE:
            const { storageId: storageIdToUpdate, storage: storageToUpdate }: {
                storageId: number;
                storage: Storage;
            } = payload;
            const storageToUpdateIndex = draft.storages?.findIndex((storage) => storage.id === storageIdToUpdate);
            if (draft.storages && storageToUpdateIndex !== undefined && storageToUpdateIndex !== -1) {
                draft.storages[storageToUpdateIndex] = storageToUpdate;
            }
            return draft;
        case ActionTypes.TOGGLE_SIDEBAR:
            const { showSidebar }: {
                showSidebar: boolean;
            } = payload;
            draft.showSidebar = showSidebar || !draft.showSidebar;
            return draft;
        case 'SET_PINNED_FOLDERS':
            const { pins }: {
                pins: PinnedFolder[];
            } = payload;
            draft.pinnedFolders = pins;
            return draft;
        case 'ADD_PINNED_FOLDER':
            const { pin }: {
                pin: PinnedFolder;
            } = payload;
            draft.pinnedFolders.push(pin);
            return draft;
        default:
            console.error('Unknown action type:', type);
            return draft;
    }
}
