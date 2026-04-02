import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { homedir } from "node:os";
import {
    ClientSideConnection,
    PROTOCOL_VERSION,
    type AnyMessage,
    type InitializeResponse,
    type SessionNotification,
    type RequestPermissionRequest,
    type RequestPermissionResponse,
    type PromptResponse,
    type SessionModelState,
} from "@agentclientprotocol/sdk";
import type {
    AgentCapabilities,
    AgentStatus,
    AgentSessionState,
    AgentSessionStreamEvent,
    AgentSessionSignalEvent,
    AgentPermissionRequest,
    AgentPermissionOption,
    AgentContentBlock,
    AgentToolCallContent,
    AgentConfigOption,
    AgentSessionMode,
    AgentNewSessionResult,
    AgentPromptContent,
    AgentPromptResult,
    AgentSessionInfo,
    AgentStopReason,
    AgentMcpServer,
} from "shared/types";

// ── Types ──

type PendingPermission = {
    resolve: (response: RequestPermissionResponse) => void;
    request: AgentPermissionRequest;
};

export type ACPAgentHandleOptions = {
    id: string;
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    description?: string;
    defaultCwd?: string;
    onSessionEvent?: (agentId: string, sessionId: string, event: AgentSessionSignalEvent) => void;
    onPermissionRequest?: (request: AgentPermissionRequest) => void;
    onStatusChange?: (agentId: string, status: AgentStatus) => void;
};

// ── Helpers ──

const STDIN_CLOSE_GRACE_MS = 200;
const SIGTERM_GRACE_MS = 2000;
const SIGKILL_GRACE_MS = 1000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function isChildAlive(child: ChildProcess): boolean {
    return child.exitCode == null && child.signalCode == null && !child.killed;
}

function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (!isChildAlive(child)) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const timer = setTimeout(() => finish(false), Math.max(0, timeoutMs));
        const finish = (val: boolean) => {
            if (settled) return;
            settled = true;
            child.off("close", onExit);
            child.off("exit", onExit);
            clearTimeout(timer);
            resolve(val);
        };
        const onExit = () => finish(true);
        child.once("close", onExit);
        child.once("exit", onExit);
    });
}

function createNdJsonStream(
    output: WritableStream<Uint8Array>,
    input: ReadableStream<Uint8Array>,
): { readable: ReadableStream<AnyMessage>; writable: WritableStream<AnyMessage> } {
    const readable = new ReadableStream<AnyMessage>({
        async start(controller) {
            let buffer = "";
            const reader = input.getReader();
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (!value) continue;
                    buffer += textDecoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        try {
                            controller.enqueue(JSON.parse(trimmed) as AnyMessage);
                        } catch {
                            // skip non-JSON lines (agent stderr noise etc.)
                        }
                    }
                }
            } finally {
                reader.releaseLock();
                controller.close();
            }
        },
    });

    const writable = new WritableStream<AnyMessage>({
        async write(message) {
            const writer = output.getWriter();
            try {
                await writer.write(textEncoder.encode(JSON.stringify(message) + "\n"));
            } finally {
                writer.releaseLock();
            }
        },
    });

    return { readable, writable };
}

// ── ACPAgentHandle ──

export class ACPAgentHandle {
    readonly id: string;
    readonly name: string;
    readonly command: string;
    readonly args: string[];
    readonly description: string;

    private child: ChildProcess | null = null;
    private connection: ClientSideConnection | null = null;
    private initResult: InitializeResponse | null = null;
    private defaultCwd: string;
    private env: Record<string, string>;

    private status: AgentStatus = 'stopped';
    private pendingPermissions = new Map<string, PendingPermission>();

    // Per-session state tracking (derived from prompt lifecycle)
    private sessionStates = new Map<string, AgentSessionState>();
    // Per-session config options cache (from newSession/setConfigOption/config_option_update)
    private sessionConfigOptions = new Map<string, AgentConfigOption[]>();

    // Per-session stream controllers for streamSession()
    private sessionStreamControllers = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();

    // Serialized session update processing (follows ACPX pattern)
    private sessionUpdateChain: Promise<void> = Promise.resolve();

    // Callbacks
    private onSessionEvent?: ACPAgentHandleOptions['onSessionEvent'];
    private onPermissionRequest?: ACPAgentHandleOptions['onPermissionRequest'];
    private onStatusChange?: ACPAgentHandleOptions['onStatusChange'];

    constructor(options: ACPAgentHandleOptions) {
        this.id = options.id;
        this.name = options.name;
        this.command = options.command;
        this.args = options.args;
        this.description = options.description || '';
        this.defaultCwd = options.defaultCwd || homedir();
        this.env = options.env || {};

        this.onSessionEvent = options.onSessionEvent;
        this.onPermissionRequest = options.onPermissionRequest;
        this.onStatusChange = options.onStatusChange;
    }

    // ── Lifecycle ──

    async start(): Promise<void> {
        if (this.connection && this.child && isChildAlive(this.child)) {
            return; // already running
        }
        if (this.connection || this.child) {
            await this.stop();
        }

        this.setStatus('starting');

        const spawnEnv: NodeJS.ProcessEnv = { ...process.env, ...this.env };
        const child = spawn(this.command, this.args, {
            cwd: this.defaultCwd,
            env: spawnEnv,
            stdio: ['pipe', 'pipe', 'pipe'],
            // On Windows, use shell mode
            ...(process.platform === 'win32' ? { shell: true } : {}),
        });

        // Wait for spawn
        await new Promise<void>((resolve, reject) => {
            const onSpawn = () => { child.off("error", onError); resolve(); };
            const onError = (err: Error) => { child.off("spawn", onSpawn); reject(err); };
            child.once("spawn", onSpawn);
            child.once("error", onError);
        });

        if (!child.stdin || !child.stdout || !child.stderr) {
            child.kill();
            throw new Error("ACP agent must have piped stdio");
        }

        // Forward stderr for debugging
        child.stderr.on("data", (chunk: Buffer) => {
            // Could optionally log/forward this
        });

        // Monitor for unexpected exit
        child.once("exit", (code, signal) => {
            if (this.status !== 'stopped') {
                console.error(`[Agent:${this.name}] Process exited unexpectedly: code=${code}, signal=${signal}`);
                this.setStatus('error');
            }
            this.rejectAllPendingPermissions();
        });

        // Create NDJSON stream
        const stdinWeb = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
        const stdoutWeb = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
        const stream = createNdJsonStream(stdinWeb, stdoutWeb);

        // Create ACP ClientSideConnection
        const connection = new ClientSideConnection(
            () => ({
                sessionUpdate: async (params: SessionNotification) => {
                    await this.handleSessionUpdate(params);
                },
                requestPermission: async (params: RequestPermissionRequest): Promise<RequestPermissionResponse> => {
                    return this.handlePermissionRequest(params);
                },
            }),
            stream,
        );

        // Monitor connection close
        connection.signal.addEventListener("abort", () => {
            if (this.status !== 'stopped') {
                this.setStatus('error');
            }
        }, { once: true });

        // Initialize ACP handshake — no fs/terminal capabilities
        try {
            const initResult = await connection.initialize({
                protocolVersion: PROTOCOL_VERSION,
                clientCapabilities: {},
                clientInfo: {
                    name: "homecloud",
                    title: "HomeCloud",
                    version: "1.0.0",
                },
            });

            this.child = child;
            this.connection = connection;
            this.initResult = initResult;
            this.setStatus('ready');

            console.log(`[Agent:${this.name}] Initialized (protocol v${initResult.protocolVersion})`);
        } catch (err) {
            child.kill();
            this.setStatus('error');
            throw err;
        }
    }

    async stop(): Promise<void> {
        this.setStatus('stopped');

        // Mark all tracked sessions as error
        for (const sessionId of this.sessionStates.keys()) {
            this.setSessionState(sessionId, 'error');
        }

        this.rejectAllPendingPermissions();
        this.closeAllSessionStreams();

        const child = this.child;
        if (child && isChildAlive(child)) {
            await this.gracefulKill(child);
        }

        this.child = null;
        this.connection = null;
        this.initResult = null;
        this.sessionStates.clear();
        this.sessionConfigOptions.clear();
        this.sessionUpdateChain = Promise.resolve();
    }

    getStatus(): AgentStatus {
        return this.status;
    }

    getCapabilities(): AgentCapabilities {
        const caps = this.initResult?.agentCapabilities;
        const sessionCaps = (caps as any)?.sessionCapabilities;
        return {
            listSessions: !!sessionCaps?.list,
            loadSession: !!caps?.loadSession,
            closeSession: !!sessionCaps?.close,
            resumeSession: !!sessionCaps?.resume,
            forkSession: !!sessionCaps?.fork,
            promptImage: !!(caps?.promptCapabilities as any)?.image,
            promptAudio: !!(caps?.promptCapabilities as any)?.audio,
            promptEmbeddedContext: !!(caps?.promptCapabilities as any)?.embeddedContext,
        };
    }

    getAgentInfo(): { name?: string; version?: string } {
        return {
            name: (this.initResult as any)?.agentInfo?.name,
            version: (this.initResult as any)?.agentInfo?.version,
        };
    }

    isRunning(): boolean {
        return this.status === 'ready' && !!this.child && isChildAlive(this.child);
    }

    getSessionState(sessionId: string): AgentSessionState {
        return this.sessionStates.get(sessionId) || 'idle';
    }

    getSessionConfigOptions(sessionId: string): AgentConfigOption[] | undefined {
        return this.sessionConfigOptions.get(sessionId);
    }

    private setSessionState(sessionId: string, state: AgentSessionState): void {
        const prev = this.sessionStates.get(sessionId);
        if (prev === state) return;
        this.sessionStates.set(sessionId, state);

        const event: AgentSessionSignalEvent = { eventType: 'session_state_change', state };

        // Push to stream as AgentSessionEvent
        this.pushToStreams(sessionId, event);

        // Dispatch through callback (→ signal)
        this.onSessionEvent?.(this.id, sessionId, event);
    }

    // ── Session Operations (delegated to ACP) ──

    async newSession(cwd?: string, mcpServers?: AgentMcpServer[]): Promise<AgentNewSessionResult> {
        const conn = this.getConnection();
        const resolvedCwd = cwd || this.defaultCwd;
        let result;
        try {
            result = await conn.newSession({
                cwd: resolvedCwd,
                mcpServers: (mcpServers || []) as any[],
            });
        } catch (err: any) {
            console.error(`[Agent:${this.name}] newSession failed (cwd=${resolvedCwd}):`, err?.message || err);
            throw err;
        }

        // Track this session as idle
        this.sessionStates.set(result.sessionId, 'idle');

        // Cache config options
        const configOptions = (result as any).configOptions?.map(mapConfigOption);
        if (configOptions) {
            this.sessionConfigOptions.set(result.sessionId, configOptions);
        }

        return {
            sessionId: result.sessionId,
            agentId: this.id,
            cwd: cwd || this.defaultCwd,
            modes: result.modes ? {
                currentModeId: (result.modes as any).currentModeId,
                availableModes: ((result.modes as any).availableModes || []).map((m: any) => ({
                    id: m.id,
                    name: m.name,
                    description: m.description,
                })),
            } : undefined,
            configOptions: (result as any).configOptions?.map(mapConfigOption),
        };
    }

    async listSessions(cwd?: string): Promise<AgentSessionInfo[]> {
        const conn = this.getConnection();
        if (!this.getCapabilities().listSessions) {
            throw new Error(`Agent "${this.name}" does not support listing sessions.`);
        }

        const result = await conn.listSessions({ cwd });
        return (result.sessions || []).map((s: any) => ({
            sessionId: s.sessionId,
            agentId: this.id,
            cwd: s.cwd || '',
            title: s.title,
            updatedAt: s.updatedAt,
            state: this.sessionStates.get(s.sessionId) || 'idle' as const,
        }));
    }

    async loadSession(sessionId: string, cwd?: string, mcpServers?: AgentMcpServer[]): Promise<void> {
        const conn = this.getConnection();
        if (!this.getCapabilities().loadSession) {
            throw new Error(`Agent "${this.name}" does not support loading sessions.`);
        }
        await conn.loadSession({
            sessionId,
            cwd: cwd || this.defaultCwd,
            mcpServers: (mcpServers || []) as any[],
        });

        // Session is now idle after load
        this.sessionStates.set(sessionId, 'idle');
    }

    async closeSession(sessionId: string): Promise<void> {
        const conn = this.getConnection();
        if (!this.getCapabilities().closeSession) {
            throw new Error(`Agent "${this.name}" does not support closing sessions.`);
        }
        await conn.unstable_closeSession({ sessionId });

        // Clean up tracked state
        this.sessionStates.delete(sessionId);
        this.sessionConfigOptions.delete(sessionId);
    }

    async prompt(sessionId: string, content: AgentPromptContent[]): Promise<AgentPromptResult> {
        const conn = this.getConnection();

        this.setSessionState(sessionId, 'processing');

        try {
            const result: PromptResponse = await conn.prompt({
                sessionId,
                prompt: content.map(block => {
                    if (block.type === 'text') return { type: 'text' as const, text: block.text };
                    if (block.type === 'resource_link') return { type: 'resource_link' as const, uri: block.uri, name: block.name, mimeType: block.mimeType };
                    if (block.type === 'image') return { type: 'image' as const, data: block.data, mimeType: block.mimeType };
                    return { type: 'text' as const, text: '' };
                }),
            });

            this.setSessionState(sessionId, 'idle');
            return { stopReason: (result.stopReason || 'end_turn') as AgentStopReason };
        } catch (err) {
            this.setSessionState(sessionId, 'error');
            throw err;
        }
    }

    async cancel(sessionId: string): Promise<void> {
        const conn = this.getConnection();
        await conn.cancel({ sessionId });
    }

    async setSessionMode(sessionId: string, modeId: string): Promise<void> {
        const conn = this.getConnection();
        await conn.setSessionMode({ sessionId, modeId });
    }

    async setSessionConfigOption(sessionId: string, configId: string, value: string): Promise<AgentConfigOption[]> {
        const conn = this.getConnection();
        const result = await conn.setSessionConfigOption({ sessionId, configId, value });
        const options = ((result as any).configOptions || []).map(mapConfigOption);
        this.sessionConfigOptions.set(sessionId, options);
        return options;
    }

    // ── Streaming ──

    createSessionStream(sessionId: string): ReadableStream<Uint8Array> {
        let controller: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({
            start(c) {
                controller = c;
            },
            cancel: () => {
                this.removeStreamController(sessionId, controller);
            },
        });

        // Register the controller for this session
        if (!this.sessionStreamControllers.has(sessionId)) {
            this.sessionStreamControllers.set(sessionId, new Set());
        }
        // The controller is assigned synchronously in `start` before this line runs
        this.sessionStreamControllers.get(sessionId)!.add(controller!);

        return stream;
    }

    // ── Permission Resolution ──

    resolvePermission(toolCallId: string, selectedOptionId: string): void {
        const pending = this.pendingPermissions.get(toolCallId);
        if (!pending) {
            throw new Error(`No pending permission request for toolCallId: ${toolCallId}`);
        }
        this.pendingPermissions.delete(toolCallId);

        // Back to processing after permission granted/denied
        this.setSessionState(pending.request.sessionId, 'processing');

        pending.resolve({
            outcome: { outcome: 'selected', optionId: selectedOptionId },
        });
    }

    cancelPermission(toolCallId: string): void {
        const pending = this.pendingPermissions.get(toolCallId);
        if (!pending) return;
        this.pendingPermissions.delete(toolCallId);

        // Back to processing (agent will handle the cancellation)
        this.setSessionState(pending.request.sessionId, 'processing');

        pending.resolve({
            outcome: { outcome: 'cancelled' },
        });
    }

    // ── Internal Handlers ──

    private async handleSessionUpdate(notification: SessionNotification): Promise<void> {
        // Serialize processing to maintain order
        this.sessionUpdateChain = this.sessionUpdateChain.then(async () => {
            try {
                const event = mapSessionUpdateToEvent(notification);
                if (!event) return;

                const sessionId = notification.sessionId;

                // Cache config option updates
                if (event.eventType === 'config_option_update') {
                    this.sessionConfigOptions.set(sessionId, event.configOptions);
                }

                // Push ALL events to active stream controllers (chat view)
                this.pushToStreams(sessionId, event);

                // Only dispatch signal-worthy events through the callback (→ signal)
                const signalEvent = asSignalEvent(event);
                if (signalEvent) {
                    this.onSessionEvent?.(this.id, sessionId, signalEvent);
                }
            } catch (err) {
                console.error(`[Agent:${this.name}] Error handling session update:`, err);
            }
        });
        await this.sessionUpdateChain;
    }

    private handlePermissionRequest(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
        return new Promise<RequestPermissionResponse>((resolve) => {
            const toolCall = (params as any).toolCall || {};
            const toolCallId = toolCall.toolCallId || 'unknown';

            const request: AgentPermissionRequest = {
                agentId: this.id,
                sessionId: params.sessionId,
                toolCallId,
                title: toolCall.title || 'Permission requested',
                kind: toolCall.kind,
                options: ((params as any).options || []).map((o: any): AgentPermissionOption => ({
                    optionId: o.optionId,
                    name: o.name,
                    kind: o.kind,
                })),
            };

            this.pendingPermissions.set(toolCallId, { resolve, request });

            // Session needs user attention for this permission
            this.setSessionState(params.sessionId, 'need_attention');

            this.onPermissionRequest?.(request);
        });
    }

    // ── Private Helpers ──

    private getConnection(): ClientSideConnection {
        if (!this.connection) {
            throw new Error(`Agent "${this.name}" is not running.`);
        }
        return this.connection;
    }

    private setStatus(status: AgentStatus): void {
        if (this.status === status) return;
        this.status = status;
        this.onStatusChange?.(this.id, status);
    }

    private pushToStreams(sessionId: string, event: AgentSessionStreamEvent): void {
        const controllers = this.sessionStreamControllers.get(sessionId);
        if (!controllers || controllers.size === 0) return;

        const chunk = textEncoder.encode(JSON.stringify(event) + "\n");
        for (const controller of controllers) {
            try {
                controller.enqueue(chunk);
            } catch {
                // Controller closed, remove it
                controllers.delete(controller);
            }
        }
    }

    private removeStreamController(sessionId: string, controller: ReadableStreamDefaultController<Uint8Array>): void {
        const controllers = this.sessionStreamControllers.get(sessionId);
        if (controllers) {
            controllers.delete(controller);
            if (controllers.size === 0) {
                this.sessionStreamControllers.delete(sessionId);
            }
        }
    }

    private closeAllSessionStreams(): void {
        for (const [, controllers] of this.sessionStreamControllers) {
            for (const controller of controllers) {
                try { controller.close(); } catch { /* ignore */ }
            }
        }
        this.sessionStreamControllers.clear();
    }

    private rejectAllPendingPermissions(): void {
        for (const [, pending] of this.pendingPermissions) {
            pending.resolve({ outcome: { outcome: 'cancelled' } });
        }
        this.pendingPermissions.clear();
    }

    private async gracefulKill(child: ChildProcess): Promise<void> {
        // Step 1: Close stdin (most graceful for stdio-based ACP agents)
        if (child.stdin && !child.stdin.destroyed) {
            try { child.stdin.end(); } catch { /* best effort */ }
        }
        let exited = await waitForChildExit(child, STDIN_CLOSE_GRACE_MS);

        // Step 2: SIGTERM
        if (!exited && isChildAlive(child)) {
            try { child.kill("SIGTERM"); } catch { /* best effort */ }
            exited = await waitForChildExit(child, SIGTERM_GRACE_MS);
        }

        // Step 3: SIGKILL
        if (!exited && isChildAlive(child)) {
            try { child.kill("SIGKILL"); } catch { /* best effort */ }
            await waitForChildExit(child, SIGKILL_GRACE_MS);
        }

        // Cleanup handles
        try { child.stdin?.destroy(); } catch { /* */ }
        try { child.stdout?.destroy(); } catch { /* */ }
        try { child.stderr?.destroy(); } catch { /* */ }
    }
}

// ── Mapping Helpers ──

/** Returns the event as a signal-worthy type, or null if it should be stream-only. */
function asSignalEvent(event: AgentSessionStreamEvent): AgentSessionSignalEvent | null {
    switch (event.eventType) {
        case 'session_state_change':
        case 'session_info_update':
        case 'tool_call':
            return event;
        default:
            return null;
    }
}

function mapConfigOption(o: any): AgentConfigOption {
    return {
        id: o.id,
        name: o.name,
        description: o.description,
        category: o.category,
        type: 'select',
        currentValue: o.currentValue,
        options: (o.options || []).map((v: any) => ({
            value: v.value,
            name: v.name,
            description: v.description,
        })),
    };
}

function mapContentBlock(c: any): AgentContentBlock | null {
    if (!c) return null;
    if (c.type === 'text') return { type: 'text', text: c.text || '' };
    if (c.type === 'image') return { type: 'image', data: c.data || '', mimeType: c.mimeType || '' };
    if (c.type === 'resource_link') return { type: 'resource_link', uri: c.uri || '', name: c.name || '', mimeType: c.mimeType };
    // Default: coerce to text
    return { type: 'text', text: JSON.stringify(c) };
}

function mapToolCallContent(items: any[]): AgentToolCallContent[] | undefined {
    if (!items || !Array.isArray(items)) return undefined;
    return items.map((item: any): AgentToolCallContent => {
        if (item.type === 'diff') {
            return { type: 'diff', diff: { path: item.path, oldText: item.oldText, newText: item.newText } };
        }
        if (item.type === 'terminal') {
            return { type: 'terminal', terminalId: item.terminalId };
        }
        // content type
        const content = mapContentBlock(item.content || item);
        return { type: 'content', content: content || { type: 'text', text: '' } };
    });
}

function mapSessionUpdateToEvent(notification: SessionNotification): AgentSessionStreamEvent | null {
    const update = (notification as any).update;
    if (!update) return null;

    const updateType: string = update.sessionUpdate;
    switch (updateType) {
        case 'agent_message_chunk': {
            const content = mapContentBlock(update.content);
            if (!content) return null;
            return { eventType: 'agent_message_chunk', content };
        }
        case 'user_message_chunk': {
            const content = mapContentBlock(update.content);
            if (!content) return null;
            return { eventType: 'user_message_chunk', content };
        }
        case 'thought_message_chunk': {
            const content = mapContentBlock(update.content);
            if (!content) return null;
            return { eventType: 'thought_message_chunk', content };
        }
        case 'tool_call':
            return {
                eventType: 'tool_call',
                toolCallId: update.toolCallId || '',
                title: update.title || '',
                kind: update.kind || 'other',
                status: update.status || 'pending',
            };
        case 'tool_call_update':
            return {
                eventType: 'tool_call_update',
                toolCallId: update.toolCallId || '',
                status: update.status,
                content: mapToolCallContent(update.content),
                locations: update.locations,
            };
        case 'plan':
            return {
                eventType: 'plan',
                entries: (update.entries || []).map((e: any) => ({
                    content: e.content || '',
                    priority: e.priority || 'medium',
                    status: e.status || 'pending',
                })),
            };
        case 'usage_update':
            return { eventType: 'usage_update', usage: update };
        case 'session_info_update':
            return { eventType: 'session_info_update', title: update.title, updatedAt: update.updatedAt };
        case 'available_commands_update':
            return {
                eventType: 'available_commands_update',
                commands: (update.availableCommands || []).map((c: any) => ({
                    name: c.name,
                    description: c.description,
                    hint: c.input?.hint,
                })),
            };
        case 'current_mode_update':
            return { eventType: 'current_mode_update', modeId: update.modeId || '' };
        case 'config_option_update':
            return {
                eventType: 'config_option_update',
                configOptions: (update.configOptions || []).map(mapConfigOption),
            };
        default:
            return null;
    }
}
