export enum ErrorType {
    Validation = 'Validation',
    Security = 'Security',
    Generic = 'Generic',
    Coded = 'Coded',
    Network = 'Network',
}

export type ErrorResponse = {
    message: string;
    type: ErrorType;
    code?: string;
    fields?: { [key: string]: string[] };
    debug?: string[];
    [key: string]: any;
}

export enum OptionalType {
    Required = 'required',
    Optional = 'optional',
    Disabled = 'disabled',
}

export enum EnvType {
    Server = 'server',
    Desktop = 'desktop'
}

export type Profile = {
    id: number;
    username: string;
    name: string;
    isAdmin: boolean;
    isPasswordProtected: boolean;
    isDisabled: boolean;
}

export enum StorageAuthType {
    Basic = 'basic',
    None = 'none',
    Digest = 'digest',
    OneAuth = 'oneauth',
}

export const StorageAuthTypes = [
    StorageAuthType.Basic,
    StorageAuthType.None,
    StorageAuthType.Digest,
    StorageAuthType.OneAuth,
]

export enum StorageType {
    WebDav = 'webdav',
    Google = 'google',
}

export type StorageMeta = {
    id: number;
    hcRoot: string;
    photosDir: string;
    photosAssetsDir: string;
    photosLastSyncOn: Date;
    isPhotosEnabled: boolean;
}

export type Storage = {
    id: number;
    name: string;
    type: StorageType;
    authType: StorageAuthType;
    url: string | null;
    username: string | null;
    oneAuthId: string | null;
    storageMeta: StorageMeta | null;
}

export type ServerConfig = {
    passwordPolicy: OptionalType;
    allowSignups: boolean;
    listProfiles: boolean;
    requireUsername: boolean;
    syncPolicy: OptionalType;
    storageTypes: StorageType[];
    isDev: boolean;
}

export enum AppName {
    Photos = 'photos',
    Files = 'files',
    Notes = 'notes',
}

export const AppNames = [
    AppName.Photos,
    AppName.Files,
    AppName.Notes,
]

export type NextUrl = {
    pathname: string;
    query: any;
}

export type SidebarItem = {
    title: string;
    icon?: string;
    href: NextUrl;
    isDisabled?: boolean;
};

export type SidebarList = {
    title?: string;
    items: SidebarItem[];
}[];

export enum SidebarType {
    Files = "files",
    Settings = "settings",
    Photos = "photos"
}

export type PageUIConfig = {
    sidebarType?: SidebarType;
    noAppShell: boolean;
}

export type PinnedFolder = {
    id: number;
    folderId: string;
    name: string;
    storageId: number;
}

export interface RemoteItem {
    name: string;
    id: string;
    parentIds: string[] | null;
    type: "file" | "directory";
    size: number | null;
    lastModified: Date | null;
    createdAt: Date | null;
    mimeType: string | null;
    etag: string | null;
    thumbnail: string | null;
}