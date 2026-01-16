import { RemoteItem, PeerInfo, ConnectionInfo, Photo, PhotoLibraryLocation, AppConfigType } from "shared/types";
import { ThemedIconName } from "./enums";

export type PeerState = PeerInfo & {
    connection: ConnectionInfo | null;
}

export type RemoteItemWithPeer = RemoteItem & {
    deviceFingerprint: string | null;
}

export type FileRemoteItem = RemoteItemWithPeer & {
    isSelected: boolean;
    assetUrl?: string;
}

export type NextUrl = {
    pathname: string;
    query?: { [key: string]: any };
}

export type SidebarItem = {
    title: string;
    icon?: ThemedIconName;
    href?: NextUrl;
    isDisabled?: boolean;
    key: string;
    data?: any;
    rightClickable?: boolean;
};

export type SidebarSection = {
    title?: string;
    icon?: ThemedIconName;
    items: SidebarItem[];
    isRefreshing?: boolean;
};

export type SidebarList = SidebarSection[];

export type PageUIConfig = {
    noAppShell: boolean;
}

export type PhotoView = {
    thumbnail?: string;
    assetUrl?: string;
    deviceFingerprint: string | null;
    libraryId: string;
} & Photo;

export enum PhotosSortOption {
    CapturedOn = 'capturedOn',
    AddedOn = 'addedOn',
}

export type PhotosFetchOptions = {
    sortBy: PhotosSortOption;
    ascending?: boolean;
    library: PhotoLibraryLocation;
    deviceFingerprint: string | null;
}

export type ContextMenuItem = {
    label?: string;
    description?: string;
    id: string;
    disabled?: boolean;
    isChecked?: boolean;
    type?: 'separator' | 'normal' | 'checkbox' | 'radio';
    role?: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll' | 'minimize' | 'close' | 'delete';
    subItems?: ContextMenuItem[];
}

export type NativeUtils = {
    getPathForFile: (file: File) => string;
    openContextMenu: (items: ContextMenuItem[], callback: (id: string) => void) => void;
}
