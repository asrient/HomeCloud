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

export type SimpleSchema = {
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | 'stream' | 'date';
    title?: string;
    typeName?: string;
    description?: string;
    properties?: { [key: string]: SimpleSchema };
    required?: string[];
    items?: SimpleSchema;
    enum?: any[];
    const?: any;
    default?: any;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    minItems?: number;
    maxItems?: number;
    oneOf?: SimpleSchema[];
    additionalProperties?: boolean | SimpleSchema;
    nullable?: boolean;
    optional?: boolean;
}

export const Sch = {
    Any: { nullable: true, optional: true } as SimpleSchema, // accepts anything
    String: { type: 'string' } as SimpleSchema,
    Number: { type: 'number' } as SimpleSchema,
    Integer: { type: 'integer' } as SimpleSchema,
    Boolean: { type: 'boolean' } as SimpleSchema,
    Stream: { type: 'stream' } as SimpleSchema,
    Date: { type: 'date' } as SimpleSchema,
    NullableDate: { type: 'date', nullable: true } as SimpleSchema,
    StringArray: { type: 'array', items: { type: 'string' } } as SimpleSchema,
    NullableString: { type: 'string', nullable: true } as SimpleSchema,
    NullableNumber: { type: 'number', nullable: true } as SimpleSchema,
    Optional: (schema: SimpleSchema): SimpleSchema => ({ ...schema, optional: true }),
    Array: (items: SimpleSchema): SimpleSchema => ({ type: 'array', items }),
    Object: (properties: { [key: string]: SimpleSchema }, required?: string[]): SimpleSchema => ({
        type: 'object', properties, ...(required ? { required } : {}),
    }),
    Enum: (...values: any[]): SimpleSchema => ({ enum: values }),
    OneOf: (...schemas: SimpleSchema[]): SimpleSchema => ({ oneOf: schemas }),
    Nullable: (schema: SimpleSchema): SimpleSchema => ({ ...schema, nullable: true }),
    Name: (name: string, schema: SimpleSchema): SimpleSchema => ({ ...schema, title: name }),
    Typed: (typeName: string, schema: SimpleSchema): SimpleSchema => ({ ...schema, typeName }),
};

export function enumValues(e: object): any[] {
    return Object.values(e);
}

export type MethodInfo = {
    isExposed: boolean;
    isAllowAll: boolean;
    passContext: boolean;
    inputSchema: SimpleSchema[] | null;
    outputSchema: SimpleSchema | null;
    info: string | null;
    isWfApi: boolean;
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

export const DeviceInfoSchema = Sch.Typed('DeviceInfo', Sch.Object({
    os: Sch.Enum(...enumValues(OSType)),
    osFlavour: Sch.NullableString,
    formFactor: Sch.Enum(...enumValues(DeviceFormType)),
}, ['os', 'formFactor']));

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

export const PeerInfoSchema = Sch.Typed('PeerInfo', Sch.Object({
    deviceName: Sch.String,
    fingerprint: Sch.String,
    version: Sch.String,
    deviceInfo: DeviceInfoSchema,
    iconKey: Sch.NullableString,
}, ['deviceName', 'fingerprint', 'version', 'deviceInfo']));

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

export const RemoteItemSchema = Sch.Typed('RemoteItem', Sch.Object({
    name: Sch.String,
    path: Sch.String,
    type: Sch.Enum('file', 'directory'),
    size: Sch.NullableNumber,
    lastModified: Sch.NullableDate,
    createdAt: Sch.NullableDate,
    mimeType: Sch.NullableString,
    etag: Sch.NullableString,
    thumbnail: Sch.NullableString,
}, ['name', 'path', 'type']));

export type Disk = {
    type: 'internal' | 'external';
    path: string;
    name: string;
    size: number;
    free: number;
}

export const DiskSchema = Sch.Typed('Disk', Sch.Object({
    type: Sch.Enum('internal', 'external'),
    path: Sch.String,
    name: Sch.String,
    size: Sch.Number,
    free: Sch.Number,
}, ['type', 'path', 'name', 'size', 'free']));

export type FileContent = {
    name: string;
    mime: string;
    stream: ReadableStream;
};

export const FileContentSchema = Sch.Typed('FileContent', Sch.Object({
    name: Sch.String,
    mime: Sch.String,
    stream: Sch.Stream,
}, ['name', 'mime', 'stream']));

export type PreviewOptions = {
    supportsHeic?: boolean;
};

export const PreviewOptionsSchema = Sch.Object({
    supportsHeic: Sch.Boolean,
});

export type PinnedFolder = {
    path: string;
    name: string;
}

export const PinnedFolderSchema = Sch.Typed('PinnedFolder', Sch.Object({
    path: Sch.String,
    name: Sch.String,
}, ['path', 'name']));

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

export const GetPhotosParamsSchema = Sch.Typed('GetPhotosParams', Sch.Object({
    cursor: Sch.NullableString,
    limit: Sch.Integer,
    sortBy: Sch.String,
    ascending: Sch.Boolean,
}, ['cursor', 'limit', 'sortBy', 'ascending']));

export type Photo = {
    id: string;
    fileId: string;
    mimeType: string;
    capturedOn: Date;
    addedOn: Date;
    duration: number;
    height: number | null;
    width: number | null;
}

export const PhotoSchema = Sch.Typed('Photo', Sch.Object({
    id: Sch.String,
    fileId: Sch.String,
    mimeType: Sch.String,
    capturedOn: Sch.Date,
    addedOn: Sch.Date,
    duration: Sch.NullableNumber,
    height: Sch.NullableNumber,
    width: Sch.NullableNumber,
}, ['id', 'fileId', 'mimeType', 'capturedOn', 'addedOn', 'duration', 'height', 'width']));

export type GetPhotosResponse = {
    photos: Photo[];
    nextCursor: string | null;
    hasMore?: boolean;
};

export const GetPhotosResponseSchema = Sch.Typed('GetPhotosResponse', Sch.Object({
    photos: Sch.Array(PhotoSchema),
    nextCursor: Sch.NullableString,
    hasMore: Sch.Boolean,
}, ['photos']));

export type DeletePhotosResponse = {
    deleteCount: number,
    deletedIds: string[],
};

export const DeletePhotosResponseSchema = Sch.Typed('DeletePhotosResponse', Sch.Object({
    deleteCount: Sch.Number,
    deletedIds: Sch.StringArray,
}, ['deleteCount', 'deletedIds']));

export type PhotoLibraryLocation = {
    id: string;
    name: string;
    location: string;
}

export const PhotoLibraryLocationSchema = Sch.Typed('PhotoLibraryLocation', Sch.Object({
    id: Sch.String,
    name: Sch.String,
    location: Sch.String,
}, ['id', 'name', 'location']));

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

export const AudioPlaybackInfoSchema = Sch.Typed('AudioPlaybackInfo', Sch.Object({
    trackName: Sch.String,
    artistName: Sch.String,
    albumName: Sch.String,
    isPlaying: Sch.Boolean,
}, ['trackName', 'isPlaying']));

export type BatteryInfo = {
    level: number; // 0 to 1
    isCharging: boolean;
    isLowPowerMode?: boolean;
}

export const BatteryInfoSchema = Sch.Typed('BatteryInfo', Sch.Object({
    level: { type: 'number', minimum: 0, maximum: 1 },
    isCharging: Sch.Boolean,
    isLowPowerMode: Sch.Boolean,
}, ['level', 'isCharging']));

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

export const ClipboardContentSchema = Sch.Typed('ClipboardContent', Sch.Object({
    type: Sch.Enum('text', 'link', 'html', 'rtf', 'image', 'filePath'),
    content: Sch.String,
    files: Sch.Array(Sch.Object({
        fingerprint: Sch.String,
        path: Sch.String,
        cut: Sch.Boolean,
    }, ['path'])),
}, ['type', 'content']));

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

export const RemoteAppInfoSchema = Sch.Typed('RemoteAppInfo', Sch.Object({
    name: Sch.String,
    id: Sch.String,
    iconPath: Sch.NullableString,
    location: Sch.String,
}, ['name', 'id']));

export type StreamingSessionInfo = {
    stream: ReadableStream<Uint8Array>;
    width: number;
    height: number;
    dpi: number;
}

export const StreamingSessionInfoSchema = Sch.Object({
    stream: Sch.Stream,
    width: Sch.Number,
    height: Sch.Number,
    dpi: Sch.Number,
}, ['stream', 'width', 'height', 'dpi']);

export type TerminalSessionInfo = {
    stream: ReadableStream<Uint8Array>;
    sessionId: string;
    cols: number;
    rows: number;
}

export const TerminalSessionInfoSchema = Sch.Object({
    stream: Sch.Stream,
    sessionId: Sch.String,
    cols: Sch.Integer,
    rows: Sch.Integer,
}, ['stream', 'sessionId', 'cols', 'rows']);

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

export const RemoteAppWindowActionPayloadSchema = Sch.Typed('RemoteAppWindowActionPayload', Sch.Object({
    action: Sch.Enum(...enumValues(RemoteAppWindowAction)),
    x: Sch.Number,
    y: Sch.Number,
    text: Sch.String,
    key: Sch.String,
    scrollDeltaX: Sch.Number,
    scrollDeltaY: Sch.Number,
    newWidth: Sch.Number,
    newHeight: Sch.Number,
    modifiers: Sch.StringArray,
}, ['action']));

export enum WorkflowColor {
    Red = "red",
    Green = "green",
    Blue = "blue",
    Yellow = "yellow",
    Purple = "purple",
    Cyan = "cyan",
}

export type WorkflowTrigger = {
    id: string;
    type: 'schedule' | 'signal';
    data: string;
    createdAt: Date;
}

export const WorkflowTriggerSchema = Sch.Typed('WorkflowTrigger', Sch.Object({
    id: Sch.String,
    type: Sch.Enum('schedule', 'signal'),
    data: Sch.String,
    createdAt: Sch.Date,
}, ['id', 'type', 'data', 'createdAt']));

export type WorkflowTriggerCreateRequest = {
    type: WorkflowTrigger['type'];
    data: string;
}

export const WorkflowTriggerCreateRequestSchema = Sch.Typed('WorkflowTriggerCreateRequest', Sch.Object({
    type: Sch.Enum('schedule', 'signal'),
    data: Sch.String,
}, ['type', 'data']));

export type WorkflowTriggerUpdatePayload = {
    id: string;
    type?: WorkflowTrigger['type'];
    data?: string;
}

export const WorkflowTriggerUpdatePayloadSchema = Sch.Typed('WorkflowTriggerUpdatePayload', Sch.Object({
    id: Sch.String,
    type: Sch.Enum('schedule', 'signal'),
    data: Sch.String,
}, ['id']));

export type WorkflowInputField = {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'select';
    options?: string[]; // for select type
    defaultValue?: string | number | boolean;
    isRequired?: boolean;
}

export type WorkflowConfig = {
    id: string;
    name: string;
    description?: string;
    isEnabled: boolean;
    color?: WorkflowColor;
    scriptPath: string;
    createdAt: Date;
    updatedAt: Date;
    inputFields: WorkflowInputField[];
    maxExecTimeSecs?: number;
}

export const WorkflowConfigSchema = Sch.Typed('WorkflowConfig', Sch.Object({
    id: Sch.String,
    name: Sch.String,
    description: Sch.String,
    isEnabled: Sch.Boolean,
    color: Sch.Enum(...enumValues(WorkflowColor)),
    scriptPath: Sch.String,
    createdAt: Sch.Date,
    updatedAt: Sch.Date,
    inputFields: Sch.Array(Sch.Object({
        name: Sch.String,
        type: Sch.Enum('string', 'number', 'boolean', 'select'),
        options: Sch.StringArray,
        defaultValue: Sch.OneOf(Sch.String, Sch.Number, Sch.Boolean),
        isRequired: Sch.Boolean,
    }, ['name', 'type'])),
    maxExecTimeSecs: Sch.Number,
}, ['id', 'name', 'isEnabled', 'scriptPath', 'createdAt', 'updatedAt', 'inputFields']));

export type WorkflowSavePayload = {
    name?: string;
    description?: string;
    isEnabled?: boolean;
    color?: WorkflowColor;
    scriptPath?: string;
    inputFields?: WorkflowInputField[];
    maxExecTimeSecs?: number;
}

export const WorkflowSavePayloadSchema = Sch.Typed('WorkflowSavePayload', Sch.Object({
    name: Sch.String,
    description: Sch.String,
    isEnabled: Sch.Boolean,
    color: Sch.Enum(...enumValues(WorkflowColor)),
    scriptPath: Sch.String,
    inputFields: Sch.Array(Sch.Object({
        name: Sch.String,
        type: Sch.Enum('string', 'number', 'boolean', 'select'),
        options: Sch.StringArray,
        defaultValue: Sch.OneOf(Sch.String, Sch.Number, Sch.Boolean),
        isRequired: Sch.Boolean,
    }, ['name', 'type'])),
    maxExecTimeSecs: Sch.Number,
}));

export type WorkflowInputs = {
    [key: string]: string | number | boolean;
}

export const WorkflowInputsSchema: SimpleSchema = {
    type: 'object',
    additionalProperties: Sch.OneOf(Sch.String, Sch.Number, Sch.Boolean),
};

export type WorkflowExecutionContext = {
    trigger?: WorkflowTrigger;
    inputs: WorkflowInputs;
    config?: WorkflowConfig;
    host: PeerInfo;
}

export type WorkflowExecutionResult = {
    status: 'ok' | 'error' | 'timeout' | 'cancelled';
    message?: string;
}

export const WorkflowExecutionResultSchema = Sch.Typed('WorkflowExecutionResult', Sch.Object({
    status: Sch.Enum('ok', 'error', 'timeout', 'cancelled'),
    message: Sch.String,
}, ['status']));

export type WorkflowExecution = {
    id: string;
    workflowId: string | null;
    script?: string;
    triggerId?: string;
    inputs?: WorkflowInputs;
    result?: WorkflowExecutionResult;
    logFilePath?: string;
    startedAt: Date;
    endedAt?: Date;
}

export const WorkflowExecutionSchema = Sch.Typed('WorkflowExecution', Sch.Object({
    id: Sch.String,
    workflowId: Sch.NullableString,
    script: Sch.String,
    triggerId: Sch.String,
    inputs: WorkflowInputsSchema,
    result: WorkflowExecutionResultSchema,
    logFilePath: Sch.String,
    startedAt: Sch.Date,
    endedAt: Sch.Date,
}, ['id', 'startedAt']));

export type ListWorkflowsParams = {
    sortBy?: 'name' | 'createdAt' | 'updatedAt';
    sortDirection?: 'asc' | 'desc';
    isEnabled?: boolean;
}

export const ListWorkflowsParamsSchema = Sch.Typed('ListWorkflowsParams', Sch.Object({
    sortBy: Sch.Enum('name', 'createdAt', 'updatedAt'),
    sortDirection: Sch.Enum('asc', 'desc'),
    isEnabled: Sch.Boolean,
}));

export type ListWorkflowExecutionsParams = {
    workflowId?: string;
    status?: WorkflowExecutionResult['status'];
    sortBy?: 'startedAt' | 'endedAt';
    sortDirection?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
}

export const ListWorkflowExecutionsParamsSchema = Sch.Typed('ListWorkflowExecutionsParams', Sch.Object({
    workflowId: Sch.String,
    status: Sch.Enum('ok', 'error', 'timeout', 'cancelled'),
    sortBy: Sch.Enum('startedAt', 'endedAt'),
    sortDirection: Sch.Enum('asc', 'desc'),
    limit: Sch.Integer,
    offset: Sch.Integer,
}));

export type ListTriggersParams = {
    workflowId?: string;
}

export const ListTriggersParamsSchema = Sch.Typed('ListTriggersParams', Sch.Object({
    workflowId: Sch.String,
}));

// MCP

export const MCP_AUTO_START_PREF_KEY = 'mcpAutoStart';

export type McpServerInfo = {
    isRunning: boolean;
    port: number | null;
    url: string | null;
}

export const McpServerInfoSchema = Sch.Typed('McpServerInfo', Sch.Object({
    isRunning: Sch.Boolean,
    port: Sch.NullableNumber,
    url: Sch.NullableString,
}, ['isRunning', 'port', 'url']));


// ─── Agent Types ─────────────────────────────────────────────────────────────

export type AgentConfig = {
    name: string;
    command: string;
    args: string[];
    env?: { name: string; value: string }[];
    addWorkflowMcp?: boolean;
}

export type AgentInfo = {
    name: string;
    title?: string;
    version: string;
}

export type ChatStatus = 'idle' | 'working' | 'asking' | 'error';

export type ChatInfo = {
    chatId: string;
    title?: string | null;
    cwd: string;
    status: ChatStatus;
    isUnread: boolean;
    pendingPermission?: AgentPermissionRequest | null;
    updatedAt?: string | null;
}

export type AgentContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource_link'; name: string; uri: string; mimeType?: string | null }
    | { type: 'resource'; resource: { uri: string; text?: string; blob?: string; mimeType?: string | null } };

export type AgentStopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

export type AgentToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type AgentToolCall = {
    toolCallId: string;
    title: string;
    kind?: string;
    status?: AgentToolCallStatus;
}

export type AgentPlanEntry = {
    content: string;
    priority: 'high' | 'medium' | 'low';
    status: 'pending' | 'in_progress' | 'completed';
}

export type AgentMessage = {
    role: 'user' | 'assistant';
    content: AgentContentBlock[];
    thoughts?: AgentContentBlock[];
    toolCalls?: AgentToolCall[];
    plan?: AgentPlanEntry[];
    stopReason?: AgentStopReason;
}

export type AgentChatUpdate =
    | { kind: 'agent_message_chunk'; content: AgentContentBlock }
    | { kind: 'agent_thought_chunk'; content: AgentContentBlock }
    | { kind: 'tool_call'; } & AgentToolCall
    | { kind: 'tool_call_update'; } & AgentToolCall
    | { kind: 'plan'; entries: AgentPlanEntry[] }
    | { kind: 'chat_info_update'; title?: string | null; updatedAt?: string | null };

export type AgentPermissionOption = {
    optionId: string;
    name: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
}

export type AgentPermissionRequest = {
    chatId: string;
    toolCall: AgentToolCall;
    options: AgentPermissionOption[];
}

export type AgentConnectionStatus = 'disconnected' | 'connecting' | 'initializing' | 'ready' | 'error';

export type AgentStatus = {
    connectionStatus: AgentConnectionStatus;
    agentInfo?: AgentInfo | null;
    error?: string | null;
}

export type ChatConfigOption = {
    key: string;
    name: string;
    currentValue: string;
    values: { value: string; name: string }[];
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const AgentConfigSchema: SimpleSchema = Sch.Typed('AgentConfig', Sch.Object({
    name: Sch.String,
    command: Sch.String,
    args: Sch.StringArray,
    env: Sch.Optional(Sch.Array(Sch.Object({ name: Sch.String, value: Sch.String }))),
    addWorkflowMcp: Sch.Optional(Sch.Boolean),
}));

export const ChatInfoSchema: SimpleSchema = Sch.Typed('ChatInfo', Sch.Object({
    chatId: Sch.String,
    title: Sch.NullableString,
    cwd: Sch.String,
    status: Sch.Enum('idle', 'working', 'asking', 'error'),
    isUnread: Sch.Boolean,
    pendingPermission: Sch.Nullable(Sch.Object({
        chatId: Sch.String,
        toolCall: Sch.Object({
            toolCallId: Sch.String,
            title: Sch.String,
        }),
        options: Sch.Array(Sch.Object({
            optionId: Sch.String,
            name: Sch.String,
            kind: Sch.Enum('allow_once', 'allow_always', 'reject_once', 'reject_always'),
        })),
    })),
    updatedAt: Sch.NullableString,
}));

export const AgentStatusSchema: SimpleSchema = Sch.Typed('AgentStatus', Sch.Object({
    connectionStatus: Sch.Enum('disconnected', 'connecting', 'initializing', 'ready', 'error'),
    agentInfo: Sch.Optional(Sch.Any),
    error: Sch.NullableString,
}));

export const ChatConfigOptionSchema: SimpleSchema = Sch.Typed('ChatConfigOption', Sch.Object({
    key: Sch.String,
    name: Sch.String,
    currentValue: Sch.String,
    values: Sch.Array(Sch.Object({ value: Sch.String, name: Sch.String })),
}));

export const AgentContentBlockSchema: SimpleSchema = Sch.Typed('AgentContentBlock', Sch.OneOf(
    Sch.Object({ type: Sch.Enum('text'), text: Sch.String }),
    Sch.Object({ type: Sch.Enum('image'), data: Sch.String, mimeType: Sch.String }),
    Sch.Object({ type: Sch.Enum('resource_link'), name: Sch.String, uri: Sch.String, mimeType: Sch.NullableString }),
    Sch.Object({ type: Sch.Enum('resource'), resource: Sch.Object({ uri: Sch.String, text: Sch.Optional(Sch.String), blob: Sch.Optional(Sch.String), mimeType: Sch.NullableString }) }),
));

export const AgentToolCallSchema: SimpleSchema = Sch.Typed('AgentToolCall', Sch.Object({
    toolCallId: Sch.String,
    title: Sch.String,
    kind: Sch.Optional(Sch.String),
    status: Sch.Optional(Sch.Enum('pending', 'in_progress', 'completed', 'failed')),
}));

export const AgentPlanEntrySchema: SimpleSchema = Sch.Typed('AgentPlanEntry', Sch.Object({
    content: Sch.String,
    priority: Sch.Enum('high', 'medium', 'low'),
    status: Sch.Enum('pending', 'in_progress', 'completed'),
}));

export const AgentMessageSchema: SimpleSchema = Sch.Typed('AgentMessage', Sch.Object({
    role: Sch.Enum('user', 'assistant'),
    content: Sch.Array(AgentContentBlockSchema),
    thoughts: Sch.Optional(Sch.Array(AgentContentBlockSchema)),
    toolCalls: Sch.Optional(Sch.Array(AgentToolCallSchema)),
    plan: Sch.Optional(Sch.Array(AgentPlanEntrySchema)),
    stopReason: Sch.Optional(Sch.Enum('end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled')),
}));
