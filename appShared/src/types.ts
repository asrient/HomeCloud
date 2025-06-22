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
    send: (data: ArrayBufferView) => void;
    onmessage: (ev: MessageEvent) => void;
    disconnect: () => void;
    onerror: (ev: ErrorEvent) => void;
    ondisconnect: (ev: CloseEvent) => void;
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

export type PairingRequest = {
    clientDeviceName: string;
    clientFinerprint: string;
    targetFingerprint: string;
    expireAt: number;
}

export type PhotoLibraryLocation = {
    name: string;
    directory: string;
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
