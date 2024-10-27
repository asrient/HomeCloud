export interface File_ extends File {
    path?: string;
}

export interface FileList_ extends FileList {
    [index: number]: File_;
}

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

export type AccessControl = { [key: string]: string };

export type Profile = {
    id: number;
    username: string | null;
    name: string;
    isAdmin: boolean;
    isPasswordProtected: boolean;
    isDisabled: boolean;
    accessControl?: AccessControl | null;
}

export enum StorageAuthType {
    Basic = 'basic',
    None = 'none',
    Digest = 'digest',
    OneAuth = 'oneauth',
    Pairing = 'pairing',
}

export const StorageAuthTypes = [
    StorageAuthType.Basic,
    StorageAuthType.None,
    StorageAuthType.Digest,
    StorageAuthType.OneAuth,
    StorageAuthType.Pairing,
]

export enum StorageType {
    WebDav = 'webdav',
    Google = 'google',
    Local = 'local',
    Dropbox = 'dropbox',
    Agent = "agent",
}

export enum PairingAuthType {
    Password = "password",
    OTP = "otp",
}

export enum OSType {
    Windows = "windows",
    MacOS = "macos",
    Linux = "linux",
    Android = "android",
    iOS = "ios",
    Unknown = "unknown",
}

export enum DeviceFormType {
    Desktop = "desktop",
    Laptop = "laptop",
    Mobile = "mobile",
    Tablet = "tablet",
    Unknown = "unknown",
    Server = "server",
}

export type DeviceInfo = {
    os: OSType;
    osFlavour: string | null;
    formFactor: DeviceFormType;
};

export type AgentDetails = {
    id: number;
    fingerprint: string;
    remoteProfileId: number;
    deviceName: string;
    remoteProfileName: string;
    lastSeen: Date;
    authority: string;
    allowClientAccess: boolean;
    profileId: number;
}

export type Storage = {
    id: number;
    name: string;
    type: StorageType;
    authType: StorageAuthType;
    url: string | null;
    username: string | null;
    oneAuthId: string | null;
    agent: AgentDetails | null;
}

export type ServerConfig = {
    passwordPolicy: OptionalType;
    allowSignups: boolean;
    listProfiles: boolean;
    requireUsername: boolean;
    syncPolicy: OptionalType;
    storageTypes: StorageType[];
    isDev: boolean;
    version?: string;
    deviceName: string;
    fingerprint: string;
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

export type SidebarList = {
    title?: string;
    items: SidebarItem[];
}[];

export enum SidebarType {
    Files = "files",
    Settings = "settings",
    Photos = "photos",
    Notes = "notes",
}

export type PageUIConfig = {
    sidebarType?: SidebarType;
    noAppShell: boolean;
}

export type PinnedFolder = {
    id: number;
    folderId: string;
    name: string;
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

export type RemoteItemWithStorage = RemoteItem & {
    storageId: number;
}

export type Photo = {
    itemId: number;
    folderNo: number;
    fileId: string;
    mimeType: string;
    capturedOn: Date;
    addedOn: Date;
    duration: number | null;
    height: number;
    width: number;
}

export type PhotoView = {
    isSelected: boolean;
    thumbnail?: string;
    assetUrl?: string;
    storageId: number;
} & Photo;

export enum PhotosSortOption {
    CapturedOn = 'capturedOn',
    AddedOn = 'addedOn',
}

export type PhotosFetchOptions = {
    sortBy: PhotosSortOption;
    ascending?: boolean;
    storageIds: number[];
}

export type NoteItem = {
    stat: RemoteItem;
    storageId: number;
    childNoteStats: RemoteItem[];
    isRootNote: boolean;
}
