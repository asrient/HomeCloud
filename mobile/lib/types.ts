import { AppConfigType, ConnectionInfo, PeerInfo, Photo, PhotoLibraryLocation, RemoteItem } from "shared/types";

export enum MobilePlatform {
    ANDROID = "android",
    IOS = "ios",
}

export enum UITheme {
    Win11 = "win11",
    Macos = "macos",
    Android = "android",
    Ios = "ios",
}

export type MobileConfigType = AppConfigType & {
    PLATFORM: MobilePlatform;
}

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

export enum SignalEvent {
    ADD = "add",
    REMOVE = "remove",
    UPDATE = "update",
    ERROR = "error"
}

export enum OSType {
    Windows = "windows",
    MacOS = "macos",
    Linux = "linux",
    Android = "android",
    iOS = "ios",
    Unknown = "unknown"
}

export enum ConnectionType {
    WEB = "web",
    LOCAL = "local"
}
