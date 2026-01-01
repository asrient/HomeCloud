export interface ProxyHandlers {
    methodCall: (fqn: string, args: any[]) => Promise<any>;
    signalSubscribe: (fqn: string) => void;
    signalUnsubscribe: (fqn: string) => void;
    signalEvent: (fqn: string, args: any[]) => void;
}

export type SignalMetadata = {
    isExposed: boolean;
    isAllowAll: boolean;
}

export const DEFAULT_AGENT_PORT = 7736;

export interface GenericDataChannel {
    send: (data: Uint8Array) => Promise<void>;
    onmessage: (ev: Uint8Array) => void;
    disconnect: () => void;
    onerror: (ev: Error | string) => void;
    ondisconnect: (ev?: Error) => void;
}

export type MethodInfo = {
    isExposed: boolean;
    isAllowAll: boolean;
    passContext: boolean;
}

export type MethodContext = {
    fingerprint: string;
    connectionType: ConnectionType;
    peerInfo: PeerInfo | null;
    fqn: string;
}

export type ServiceDoc = {
    __doctype__: 'function' | 'error';
    description?: string;
    methodInfo?: MethodInfo;
    fqn?: string;
}

export type ServiceDocTree = {
    [key: string]: ServiceDoc | ServiceDocTree;
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

export enum OptionalType {
    Required = "required",
    Optional = "optional",
    Disabled = "disabled",
}

export enum ConnectionType {
    WEB = "web",
    LOCAL = "local",
}

export type PeerCandidate = {
    fingerprint: string;
    deviceName?: string;
    iconKey?: string;
    data?: any;
    connectionType: ConnectionType;
}

export enum UITheme {
    Win11 = "win11",
    Macos = "macos",
    Android = "android",
    Ios = "ios",
}

export type AppConfigType = {
    DATA_DIR: string;
    IS_DEV: boolean;
    SECRET_KEY: string;
    VERSION: string;
    DEVICE_NAME: string;
    PUBLIC_KEY_PEM: string;
    PRIVATE_KEY_PEM: string;
    FINGERPRINT: string;
    APP_NAME: string;
    UI_THEME: UITheme;
    SERVER_URL: string;
    WS_SERVER_URL: string;
}

export type PeerInfo = {
    deviceName: string;
    fingerprint: string;
    version: string;
    deviceInfo: DeviceInfo;
    iconKey: string | null;
}

export type BonjourTxt = {
    version: string;
    iconKey: string;
    deviceName: string;
    fingerprint: string;
}

export type NativeButtonConfig = {
    text: string;
    type?: "primary" | "default" | "danger";
    isDefault?: boolean;
    isHighlighted?: boolean;
    onPress: () => void;
}

export type NativeAskConfig = {
    title: string;
    description?: string;
    buttons: NativeButtonConfig[];
}

export type NativeAsk = {
    close: () => void;
}

export enum StoreNames {
    APP = "app",
    FILES = "files",
    PHOTOS = "photos",
    ACCOUNT = "account",
}

export type DefaultDirectories = {
    Pictures: string | null;
    Documents: string | null;
    Downloads: string | null;
    Videos: string | null;
    Movies: string | null;
    Music: string | null;
    Desktop: string | null;
};

export type RemoteItem = {
    name: string;
    path: string;
    type: "file" | "directory";
    size: number | null;
    lastModified: Date | null;
    createdAt: Date | null;
    mimeType: string | null;
    etag: string | null;
    thumbnail: string | null;
}

export type FileContent = {
    name: string;
    mime: string;
    stream: ReadableStream;
};

export type PinnedFolder = {
    path: string;
    name: string;
}

export type ConnectionInfo = {
    fingerprint: string;
    deviceName: string | null;
    connectionType: ConnectionType;
}

export enum SignalEvent {
    ADD = "add",
    REMOVE = "remove",
    UPDATE = "update",
    ERROR = "error",
}

export type GetPhotosParams = {
    cursor: string | null,
    limit: number,
    sortBy: string,
    ascending: boolean,
};

export type GetPhotosResponse = {
    photos: Photo[];
    nextCursor: string | null;
    hasMore?: boolean;
};

export type DeletePhotosResponse = {
    deleteCount: number,
    deletedIds: string[],
};

export type PhotoLibraryLocation = {
    id: string;
    name: string;
    location: string;
}

export type Photo = {
    id: string;
    fileId: string;
    mimeType: string;
    capturedOn: Date;
    addedOn: Date;
    duration: number;
    height: number;
    width: number;
}

export type WebcInit = {
    fingerprint: string;
    pin: string;
    serverAddress?: string;
    serverPort?: number;
}

export type WebcPeerData = {
    pin: string;
    peerAddress: string;
    peerPort: number;
}

export type AccountLinkResponse = {
    requestId: string;
    isEmailChange: boolean;
    requiresVerification: boolean;
}

export type AccountLinkVerifyResponse = {
    authToken: string;
    tokenExpiry: number;
    email: string | null;
    accountId: string;
};

export type AudioPlaybackInfo = {
    trackName: string;
    artistName?: string;
    albumName?: string;
    isPlaying: boolean;
}
