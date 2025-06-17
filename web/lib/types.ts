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
    deviceName: string;
    lastSeen: Date;
    authority: string;
    allowClientAccess: boolean;
    iconKey?: string;
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
    storageTypes: StorageType[];
    isDev: boolean;
    version?: string;
    deviceName: string;
    fingerprint: string;
    userName: string;
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

export type SidebarList = {
    title?: string;
    items: SidebarItem[];
}[];

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

export type PhotoLibrary = {
    id: number;
    name: string;
    location: string;
    storageId: number;
}

export type Photo = {
    id: number;
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
    libraryId: number;
} & Photo;

export enum PhotosSortOption {
    CapturedOn = 'capturedOn',
    AddedOn = 'addedOn',
}

export type PhotosFetchOptions = {
    sortBy: PhotosSortOption;
    ascending?: boolean;
    libraries: PhotoLibrary[];
}

export type AgentCandidate = {
    fingerprint?: string;
    deviceName?: string;
    iconKey?: string;
    host: string;
}

export type AgentInfo = {
    deviceName: string;
    fingerprint: string;
    version: string;
    deviceInfo: DeviceInfo;
    pairingAuthType: PairingAuthType;
    iconKey?: string;
}
