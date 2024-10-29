import { Dispatch, createContext } from 'react';
import { Profile, ServerConfig, Storage, PinnedFolder, NoteItem, RemoteItem, DeviceInfo } from './types';

export type AppStateType = {
    isInitalized: boolean;
    isAppLoaded: boolean;
    serverConfig: ServerConfig | null;
    deviceInfo: DeviceInfo | null;
    appError: string | null;
    profile: Profile | null;
    storages: Storage[] | null;
    disabledStorages: number[];
    showSidebar: boolean;
    pinnedFolders: {
        [storageId: number]: PinnedFolder[];
    };
    disks: {
        [storageId: number]: RemoteItem[];
    };
    notes: { [id: string]: NoteItem };
    rootNoteStats: Record<number, RemoteItem[]>;
    iconKey: string | null;
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
    UPDATE_PROFILE = 'UPDATE_PROFILE',
    ADD_NOTE = 'ADD_NOTE',
    RENAME_NOTE = 'RENAME_NOTE',
    REMOVE_NOTE = 'REMOVE_NOTE',
    SET_ROOT_NOTE_STATS = 'SET_ROOT_NOTE_STATS',
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
    showSidebar: false,
    pinnedFolders: {},
    disks: {},
    notes: {},
    rootNoteStats: {},
    deviceInfo: null,
    iconKey: null,
};

export const AppContext = createContext<AppStateType>(initialAppState);
export const DispatchContext = createContext<Dispatch<AppDispatchType> | null>(null);

export function noteUid(storageId: number, id: string) {
    return `${storageId}:${id}`;
}

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
            draft.profile = payload.profile;
            draft.storages = payload.storages;
            draft.disabledStorages = [];
            draft.pinnedFolders = {};
            draft.notes = {};
            draft.rootNoteStats = {};
            draft.deviceInfo = payload.deviceInfo;
            draft.iconKey = payload.iconKey;
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
        case ActionTypes.UPDATE_PROFILE: {
            const { profile }: {
                profile: Profile;
            } = payload;
            draft.profile = profile;
            return draft;
        }
        case ActionTypes.ADD_NOTE: {
            const { note }: {
                note: NoteItem;
            } = payload;

            const parentId = note.stat.parentIds?.[0];
            if (parentId) {
                const parentNote = draft.notes[noteUid(note.storageId, parentId)];
                if (parentNote) {
                    const existingIndex = parentNote.childNoteStats.findIndex((stat) => stat.id === note.stat.id);
                    if (existingIndex !== undefined && existingIndex !== -1) {
                        parentNote.childNoteStats[existingIndex] = note.stat;
                    } else {
                        parentNote.childNoteStats.push(note.stat);
                    }
                }
            }
            draft.notes[noteUid(note.storageId, note.stat.id)] = note;
            if (note.isRootNote && draft.rootNoteStats[note.storageId]) {
                const rootNoteStats = draft.rootNoteStats[note.storageId];
                const existingIndex = rootNoteStats.findIndex((stat) => stat.id === note.stat.id);
                if (existingIndex !== undefined && existingIndex !== -1) {
                    rootNoteStats[existingIndex] = note.stat;
                } else {
                    draft.rootNoteStats[note.storageId] = [...rootNoteStats, note.stat];
                }
            }
            return draft;
        }
        case ActionTypes.RENAME_NOTE: {
            const { newName, newId, childNoteStats, oldId, storageId }: {
                newName: string;
                newId: string;
                oldId: string;
                storageId: number;
                childNoteStats: RemoteItem[];
            } = payload;
            const oldUid = noteUid(storageId, oldId);
            const note = draft.notes[oldUid];
            if (note) {
                note.stat.name = newName;
                note.stat.id = newId;
                note.childNoteStats = childNoteStats;
                draft.notes[noteUid(note.storageId, newId)] = note;
                delete draft.notes[oldUid];
                const parentId = note.stat.parentIds?.[0];
                if (parentId) {
                    const parentNote = draft.notes[noteUid(note.storageId, parentId)];
                    if (parentNote) {
                        parentNote.childNoteStats = parentNote.childNoteStats.filter((stat) => stat.id !== oldId);
                        parentNote.childNoteStats.push(note.stat);
                    }
                }
                if (note.isRootNote && draft.rootNoteStats[note.storageId]) {
                    const rootNoteStats = draft.rootNoteStats[note.storageId]
                    draft.rootNoteStats[note.storageId] = [...rootNoteStats.filter((stat) => stat.id !== oldId), note.stat];
                }
            }
            return draft;
        }
        case ActionTypes.REMOVE_NOTE: {
            const { id, storageId }: {
                id: string;
                storageId: number;
            } = payload;
            const note = draft.notes[noteUid(storageId, id)];
            if (!note) return draft;
            const parentId = note.stat.parentIds?.[0];
            if (parentId) {
                const parentNote = draft.notes[noteUid(note.storageId, parentId)];
                if (parentNote) {
                    parentNote.childNoteStats = parentNote.childNoteStats.filter((stat) => stat.id !== id);
                }
            }

            if (note.isRootNote && draft.rootNoteStats[note.storageId]) {
                const rootNoteStats = draft.rootNoteStats[note.storageId];
                draft.rootNoteStats[note.storageId] = rootNoteStats.filter((stat) => stat.id !== id);
            }

            delete draft.notes[noteUid(storageId, id)];
            return draft;
        }
        case ActionTypes.SET_ROOT_NOTE_STATS: {
            const { storageId, rootNoteStats }: {
                storageId: number;
                rootNoteStats: RemoteItem[];
            } = payload;
            draft.rootNoteStats[storageId] = rootNoteStats;
            return draft;
        }
        default:
            console.error('Unknown action type:', type);
            return draft;
    }
}
