import { RemoteItem, PeerInfo, ConnectionInfo, Photo, PhotoLibraryLocation } from "shared/types";

export type PeerState = PeerInfo & {
    connection: ConnectionInfo | null;
}

export interface File_ extends File {
    path?: string;
}

export interface FileList_ extends FileList {
    [index: number]: File_;
}

export type RemoteItemWithPeer = RemoteItem & {
    deviceFingerprint: string | null;
}

export enum AppName {
    Photos = 'photos',
    Files = 'files',
}

export const AppNames = [
    AppName.Photos,
    AppName.Files,
]

export type NextUrl = {
    pathname: string;
    query?: { [key: string]: any };
}

export type SidebarItem = {
    title: string;
    icon?: string;
    href?: NextUrl;
    isDisabled?: boolean;
    key: string;
    data?: any;
    rightClickable?: boolean;
};

export type SidebarSection = {
    title?: string;
    items: SidebarItem[];
};

export type SidebarList = SidebarSection[];

export enum SidebarType {
    Files = "files",
    Settings = "settings",
    Photos = "photos",
    Dev = "dev",
}

export type PageUIConfig = {
    sidebarType?: SidebarType;
    noAppShell: boolean;
}

export type PhotoView = {
    isSelected: boolean;
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
