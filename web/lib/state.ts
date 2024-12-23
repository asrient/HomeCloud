import { Dispatch, createContext } from 'react';
import { ServerConfig, Storage, PinnedFolder, RemoteItem, DeviceInfo, PhotoLibrary } from './types';

export type AppStateType = {
    isInitalized: boolean;
    isAppLoaded: boolean;
    serverConfig: ServerConfig | null;
    deviceInfo: DeviceInfo | null;
    appError: string | null;
    storages: Storage[] | null;
    disabledStorages: number[];
    showSidebar: boolean;
    pinnedFolders: {
        [storageId: number]: PinnedFolder[];
    };
    disks: {
        [storageId: number]: RemoteItem[];
    };
    photoLibraries: Record<number, PhotoLibrary[]>;
    iconKey: string | null;
    isAuthenticated: boolean;
};

export enum ActionTypes {
    INITIALIZE = 'INITIALIZE',
    ERROR = 'ERROR',
    APP_LOADED = 'APP_LOADED',
    TOGGLE_STORAGE = 'DISABLE_STORAGE',
    ADD_STORAGE = 'ADD_STORAGE',
    REMOVE_STORAGE = 'REMOVE_STORAGE',
    ADD_STORAGE_META = 'ADD_STORAGE_META',
    UPDATE_STORAGE = 'UPDATE_STORAGE',
    TOGGLE_SIDEBAR = 'TOGGLE_SIDEBAR',
    SET_PINNED_FOLDERS = 'SET_PINNED_FOLDERS',
    SET_DISKS = 'SET_DISKS',
    ADD_PINNED_FOLDER = 'ADD_PINNED_FOLDER',
    REMOVE_PINNED_FOLDER = 'REMOVE_PINNED_FOLDER',
    SET_PHOTO_LIBRARIES = 'SET_PHOTO_LIBRARIES',
    REMOVE_PHOTO_LIBRARY = "REMOVE_PHOTO_LIBRARY",
    ADD_PHOTO_LIBRARY = "ADD_PHOTO_LIBRARY",
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
    storages: null,
    disabledStorages: [],
    showSidebar: false,
    pinnedFolders: {},
    disks: {},
    deviceInfo: null,
    iconKey: null,
    photoLibraries: {},
    isAuthenticated: false,
};

export const AppContext = createContext<AppStateType>(initialAppState);
export const DispatchContext = createContext<Dispatch<AppDispatchType> | null>(null);

export function reducer(draft: AppStateType, action: AppDispatchType) {
    const { type, payload } = action;
    switch (type) {
        case ActionTypes.APP_LOADED: {
            const { showSidebar }: {
                showSidebar: boolean | undefined;
            } = payload;
            draft.showSidebar = showSidebar || false;
            draft.isAppLoaded = true;
            return draft;
        }
        case ActionTypes.INITIALIZE: {
            draft.isInitalized = true;
            draft.serverConfig = payload.config;
            draft.appError = null;
            draft.storages = payload.storages;
            draft.disabledStorages = [];
            draft.pinnedFolders = {};
            draft.photoLibraries = {};
            draft.deviceInfo = payload.deviceInfo;
            draft.iconKey = payload.iconKey;
            draft.isAuthenticated = payload.isAuthenticated;
            return draft;
        }
        case ActionTypes.ERROR: {
            draft.isInitalized = true;
            draft.appError = payload;
            return draft;
        }
        case ActionTypes.TOGGLE_STORAGE: {
            const { storageId, disabled } = payload;
            if (disabled) {
                draft.disabledStorages.push(storageId);
            } else {
                draft.disabledStorages = draft.disabledStorages.filter((id) => id !== storageId);
            }
            return draft;
        }
        case ActionTypes.ADD_STORAGE: {
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
        }
        case ActionTypes.UPDATE_STORAGE: {
            const { storageId: storageIdToUpdate, storage: storageToUpdate }: {
                storageId: number;
                storage: Storage;
            } = payload;
            const storageToUpdateIndex = draft.storages?.findIndex((storage) => storage.id === storageIdToUpdate);
            if (draft.storages && storageToUpdateIndex !== undefined && storageToUpdateIndex !== -1) {
                draft.storages[storageToUpdateIndex] = storageToUpdate;
            }
            return draft;
        }
        case ActionTypes.REMOVE_STORAGE: {
            const { storageId }: {
                storageId: number;
            } = payload;
            draft.storages = draft.storages?.filter((storage) => storage.id !== storageId) || null;
            return draft;
        }
        case ActionTypes.TOGGLE_SIDEBAR: {
            const { showSidebar }: {
                showSidebar: boolean;
            } = payload;
            draft.showSidebar = showSidebar || !draft.showSidebar;
            return draft;
        }
        case ActionTypes.SET_PINNED_FOLDERS: {
            const { pins, storageId }: {
                pins: PinnedFolder[];
                storageId: number;
            } = payload;
            draft.pinnedFolders[storageId] = pins;
            return draft;
        }
        case ActionTypes.SET_DISKS: {
            const { items, storageId }: {
                items: RemoteItem[];
                storageId: number;
            } = payload;
            draft.disks[storageId] = items;
            return draft;
        }
        case ActionTypes.ADD_PINNED_FOLDER: {
            const { pin, storageId }: {
                pin: PinnedFolder;
                storageId: number;
            } = payload;
            const existingIndex = draft.pinnedFolders[storageId].findIndex((pinnedFolder) => pinnedFolder.id === pin.id);
            if (existingIndex !== undefined && existingIndex !== -1) {
                draft.pinnedFolders[storageId][existingIndex] = pin;
                return draft;
            }
            draft.pinnedFolders[storageId].push(pin);
            return draft;
        }
        case ActionTypes.REMOVE_PINNED_FOLDER: {
            const { storageId, folderId }: {
                storageId: number;
                folderId: string;
            } = payload;
            draft.pinnedFolders[storageId] = draft.pinnedFolders[storageId].filter((pinnedFolder) => !(pinnedFolder.folderId === folderId));
            return draft;
        }
        case ActionTypes.SET_PHOTO_LIBRARIES: {
            const { storageId, photoLibraries }: {
                storageId: number;
                photoLibraries: PhotoLibrary[];
            } = payload;
            draft.photoLibraries[storageId] = photoLibraries;
            return draft;
        }
        case ActionTypes.REMOVE_PHOTO_LIBRARY: {
            const { storageId, libraryId }: {
                storageId: number;
                libraryId: number;
            } = payload;
            draft.photoLibraries[storageId] = draft.photoLibraries[storageId].filter((lib) => lib.id !== libraryId);
            return draft;
        }
        case ActionTypes.ADD_PHOTO_LIBRARY: {
            const { storageId, library }: {
                storageId: number;
                library: PhotoLibrary;
            } = payload;
            if (!draft.photoLibraries[storageId]) {
                draft.photoLibraries[storageId] = [];
            }
            draft.photoLibraries[storageId].push(library);
            return draft;
        }
        default:
            console.error('Unknown action type:', type);
            return draft;
    }
}
