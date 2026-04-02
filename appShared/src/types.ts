export const CON_IFACE_PREF_KEY = 'conIface_';

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
    expiry?: number;
    priority?: number;
}

export type PeerConnectRequest = {
    fingerprint: string;
    addresses: string[];
    port: number;
}

export enum UITheme {
    Win11 = "win11",
    Macos = "macos",
    Android = "android",
    Ios = "ios",
}

export type AppConfigType = {
    DATA_DIR: string;
    CACHE_DIR: string;
    IS_DEV: boolean;
    IS_STORE_DISTRIBUTION: boolean;
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
    OS: OSType;
}

export type PeerInfo = {
    deviceName: string;
    fingerprint: string;
    version: string;
    deviceInfo: DeviceInfo;
    iconKey: string | null;
}

export type BonjourTxt = {
    ver: string;
    icn: string;
    nme: string;
    fpt: string;
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
    DISCOVERY_CACHE = "discovery_cache",
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

export type Disk = {
    type: 'internal' | 'external';
    path: string;
    name: string;
    size: number;
    free: number;
}

export type FileContent = {
    name: string;
    mime: string;
    stream: ReadableStream;
};

export type PreviewOptions = {
    supportsHeic?: boolean;
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
    peerAddresses: string[];
    peerPort: number;
}

export type WebcReject = {
    pin: string;
    message: string;
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

export type BatteryInfo = {
    level: number; // 0 to 1
    isCharging: boolean;
    isLowPowerMode?: boolean;
}

export type ScreenLockStatus = 'locked' | 'unlocked' | 'not-supported';

export type ClipboardFile = {
    fingerprint?: string;
    path: string;
    cut?: boolean;
};

export type ClipboardContentType = 'text' | 'link' | 'html' | 'rtf' | 'image' | 'filePath';

export type ClipboardContent = {
    type: ClipboardContentType;
    content: string;
    files?: ClipboardFile[];
}

export type FileFilter = {
    name: string;
    extensions: string[];
}

export type RemoteAppInfo = {
    name: string;
    id: string;
    iconPath: string | null;
    location?: string;
}

export type StreamingSessionInfo = {
    stream: ReadableStream<Uint8Array>;
    width: number;
    height: number;
    dpi: number;
}

export type TerminalSessionInfo = {
    stream: ReadableStream<Uint8Array>;
    sessionId: string;
    cols: number;
    rows: number;
}

export enum RemoteAppWindowAction {
    Focus = "focus",
    Minimize = "minimize",
    Maximize = "maximize",
    Restore = "restore",
    Close = "close",
    Click = "click",
    DoubleClick = "doubleClick",
    RightClick = "rightClick",
    Hover = "hover",
    TextInput = "textInput",
    KeyInput = "keyInput",
    Scroll = "scroll",
    Resize = "resize",
    DragStart = "dragStart",
    DragMove = "dragMove",
    DragEnd = "dragEnd",
}

export type RemoteAppWindowActionPayload = {
    action: RemoteAppWindowAction;
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    scrollDeltaX?: number;
    scrollDeltaY?: number;
    newWidth?: number;
    newHeight?: number;
    modifiers?: string[]; // e.g. ["shift", "cmd", "alt", "ctrl"]
}

// ── Agent Types ──

export type AgentMcpServerStdio = {
    name: string;
    command: string;
    args?: string[];
    env?: { name: string; value: string }[];
};

export type AgentMcpServerHttp = {
    type: 'http';
    name: string;
    url: string;
    headers?: { name: string; value: string }[];
};

export type AgentMcpServer = AgentMcpServerStdio | AgentMcpServerHttp;

export type AgentConfig = {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    description?: string;
    cwd?: string;
};

export type AgentCapabilities = {
    listSessions: boolean;
    loadSession: boolean;
    closeSession: boolean;
    resumeSession: boolean;
    forkSession: boolean;
    promptImage: boolean;
    promptAudio: boolean;
    promptEmbeddedContext: boolean;
};

export type AgentStatus = 'ready' | 'starting' | 'error' | 'stopped';

export type AgentInfo = {
    id: string;
    name: string;
    description: string;
    command: string;
    args: string[];
    capabilities: AgentCapabilities;
    status: AgentStatus;
    agentName?: string;
    agentVersion?: string;
};

export type AgentSessionState = 'idle' | 'processing' | 'need_attention' | 'error';

export type AgentSessionInfo = {
    sessionId: string;
    agentId: string;
    cwd: string;
    title?: string;
    updatedAt?: string;
    state: AgentSessionState;
};

export type AgentContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource_link'; uri: string; name: string; mimeType?: string };

export type AgentToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type AgentToolCallKind = 'read' | 'write' | 'execute' | 'search' | 'browser' | 'switch_mode' | 'mcp' | 'other';

export type AgentDiff = {
    path: string;
    oldText?: string;
    newText: string;
};

export type AgentToolCallContent =
    | { type: 'content'; content: AgentContentBlock }
    | { type: 'diff'; diff: AgentDiff }
    | { type: 'terminal'; terminalId: string };

export type AgentPlanEntry = {
    content: string;
    priority: 'high' | 'medium' | 'low';
    status: 'pending' | 'in_progress' | 'completed';
};

/** Base union of all session event types. Use AgentSessionStreamEvent or AgentSessionSignalEvent. */
export type AgentSessionEvent =
    | { eventType: 'agent_message_chunk'; content: AgentContentBlock }
    | { eventType: 'user_message_chunk'; content: AgentContentBlock }
    | { eventType: 'thought_message_chunk'; content: AgentContentBlock }
    | { eventType: 'tool_call'; toolCallId: string; title: string; kind: AgentToolCallKind; status: AgentToolCallStatus }
    | { eventType: 'tool_call_update'; toolCallId: string; status?: AgentToolCallStatus; content?: AgentToolCallContent[]; locations?: { path: string; line?: number }[] }
    | { eventType: 'plan'; entries: AgentPlanEntry[] }
    | { eventType: 'usage_update'; usage: Record<string, unknown> }
    | { eventType: 'session_info_update'; title?: string; updatedAt?: string }
    | { eventType: 'available_commands_update'; commands: { name: string; description: string; hint?: string }[] }
    | { eventType: 'current_mode_update'; modeId: string }
    | { eventType: 'config_option_update'; configOptions: AgentConfigOption[] }
    | { eventType: 'session_state_change'; state: AgentSessionState };

/** Events delivered through the ReadableStream (streamSession). All event types. */
export type AgentSessionStreamEvent = AgentSessionEvent;

/** Lightweight events delivered through Signals (globally visible). */
export type AgentSessionSignalEvent = Extract<AgentSessionEvent, { eventType: 'session_state_change' | 'session_info_update' | 'tool_call' }>;

export type AgentConfigOption = {
    id: string;
    name: string;
    description?: string;
    category?: string;
    type: 'select';
    currentValue: string;
    options: { value: string; name: string; description?: string }[];
};

export type AgentSessionMode = {
    id: string;
    name: string;
    description?: string;
};

export type AgentPermissionOptionKind = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';

export type AgentPermissionOption = {
    optionId: string;
    name: string;
    kind: AgentPermissionOptionKind;
};

export type AgentPermissionRequest = {
    agentId: string;
    sessionId: string;
    toolCallId: string;
    title: string;
    kind?: AgentToolCallKind;
    options: AgentPermissionOption[];
};

export type AgentPermissionResponse = {
    toolCallId: string;
    selectedOptionId: string;
};

export type AgentPromptContent =
    | { type: 'text'; text: string }
    | { type: 'resource_link'; uri: string; name: string; mimeType?: string }
    | { type: 'image'; data: string; mimeType: string };

export type AgentStopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

export type AgentPromptResult = {
    stopReason: AgentStopReason;
};

export type AgentNewSessionResult = {
    sessionId: string;
    agentId: string;
    cwd: string;
    modes?: { currentModeId: string; availableModes: AgentSessionMode[] };
    configOptions?: AgentConfigOption[];
};

export type AgentSessionFilter = {
    agentId?: string;
    cwd?: string;
};
