import { Service, serviceStartMethod, serviceStopMethod, exposed, info, input, output, wfApi } from './servicePrimatives';
import Signal from './signals';
import ConfigStorage from './storage';
import {
    Sch,
    AgentConfig, AgentStatus, ChatInfo, ChatConfigOption, AgentMessage, AgentMessageEntry, AgentToolCall,
    AgentConfigSchema, ChatInfoSchema, AgentStatusSchema, ChatConfigOptionSchema, AgentContentBlockSchema, AgentMessageSchema,
    AgentChatUpdate,
    AgentContentBlock,
    AgentPermissionOption,
    AgentPermissionRequest,
    AgentStopReason,
    SignalEvent,
} from './types';

const AGENT_CONFIG_KEY = 'agentConfig';

export const agentPresets: AgentConfig[] = [
    { name: 'GitHub Copilot', command: 'copilot', args: ['--acp'] },
    { name: 'Claude Code', command: 'npx', args: ['-y', '@agentclientprotocol/claude-agent-acp'] },
    { name: 'Gemini CLI', command: 'gemini', args: ['--acp'] },
    { name: 'Codex CLI', command: 'npx', args: ['-y', '@agentclientprotocol/codex-acp'] },
    { name: 'Augment Code', command: 'auggie', args: ['--acp'] },
];

type PendingPermission = {
    resolve: (result: { outcome: { outcome: string; optionId?: string } }) => void;
    reject: (reason: any) => void;
    request: AgentPermissionRequest;
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class AgentService extends Service {
    static serviceDescription = "Chat with the on-device AI agent";

    protected store: ConfigStorage;
    private pendingPermissions = new Map<string, PendingPermission>();

    public async init() {
        this._init();
        this.store = modules.ConfigStorage.getInstance('agentService');
        await this.store.load();
    }

    @serviceStartMethod
    public async start() {
        const config = this.getAgentConfigSync();
        if (config) {
            this._onStart(config).catch(err => {
                console.error('[AgentService] Failed to auto-start:', err.message);
                this.dispatchAgentUpdate(SignalEvent.ERROR, { connectionStatus: 'error', error: err.message });
            });
        }
    }

    @serviceStopMethod
    public async stop() {
        this._onStop();
        this.rejectAllPermissions();
    }

    // ── Signals ──

    public agentSignal = new Signal<[SignalEvent, { status: AgentStatus; config: AgentConfig | null }]>({ isExposed: true, isAllowAll: false });
    public chatInfoSignal = new Signal<[ChatInfo]>({ isExposed: true, isAllowAll: false });
    public messageStreamSignal = new Signal<[string, AgentChatUpdate]>({ isExposed: true, isAllowAll: false });

    // ── Client-side helpers (not @exposed — invoke via `localSc.agent.*`) ──

    /**
     * Apply a streaming `AgentChatUpdate` to an `AgentMessage`, returning a
     * new message with the entry timeline updated. Consecutive text/thought
     * chunks of the same kind are concatenated so markdown stays whole. Tool
     * calls are inserted at their position in the timeline; subsequent
     * `tool_call_update` events mutate the existing entry in-place
     * (preserving order). Updates that don't affect the message timeline
     * (e.g. `chat_info_update`) return the original reference.
     */
    public appendChatUpdate(msg: AgentMessage, update: AgentChatUpdate): AgentMessage {
        switch (update.kind) {
            case 'agent_message_chunk':
            case 'agent_thought_chunk': {
                const slot: 'content' | 'thought' = update.kind === 'agent_message_chunk' ? 'content' : 'thought';
                const entries = msg.entries.slice();
                const last = entries[entries.length - 1];
                if (last && last.kind === slot && update.content.type === 'text' && last.content.type === 'text') {
                    entries[entries.length - 1] = {
                        kind: slot,
                        content: { type: 'text', text: last.content.text + update.content.text },
                    };
                } else {
                    entries.push({ kind: slot, content: update.content } as AgentMessageEntry);
                }
                return { ...msg, entries };
            }
            case 'tool_call': {
                // Upsert by id — some agents re-emit `tool_call` (instead of
                // `tool_call_update`) for status changes. Don't duplicate.
                const tc = update.toolCall;
                const idx = msg.entries.findIndex(
                    e => e.kind === 'tool_call' && e.toolCall.toolCallId === tc.toolCallId,
                );
                const entries = msg.entries.slice();
                if (idx >= 0) {
                    const existing = entries[idx] as Extract<AgentMessageEntry, { kind: 'tool_call' }>;
                    // Strip undefined so a re-emit with fewer fields doesn't
                    // blank an earlier `title`.
                    const patch: Partial<AgentToolCall> = {};
                    for (const [k, v] of Object.entries(tc)) {
                        if (v !== undefined) (patch as any)[k] = v;
                    }
                    entries[idx] = { kind: 'tool_call', toolCall: { ...existing.toolCall, ...patch } };
                } else {
                    entries.push({ kind: 'tool_call', toolCall: tc });
                }
                return { ...msg, entries };
            }
            case 'tool_call_update': {
                // Strip undefined so partial updates don't blank fields captured
                // from the initial `tool_call`.
                const patch: Partial<AgentToolCall> = {};
                for (const [k, v] of Object.entries(update.toolCall)) {
                    if (v !== undefined) (patch as any)[k] = v;
                }
                if (!patch.toolCallId) return msg;
                const idx = msg.entries.findIndex(
                    e => e.kind === 'tool_call' && e.toolCall.toolCallId === patch.toolCallId,
                );
                const entries = msg.entries.slice();
                if (idx >= 0) {
                    const existing = entries[idx] as Extract<AgentMessageEntry, { kind: 'tool_call' }>;
                    entries[idx] = { kind: 'tool_call', toolCall: { ...existing.toolCall, ...patch } };
                } else {
                    entries.push({ kind: 'tool_call', toolCall: { title: '', ...patch } as AgentToolCall });
                }
                return { ...msg, entries };
            }
            case 'plan':
                return { ...msg, plan: update.entries };
            case 'chat_info_update':
                return msg;
        }
        return msg;
    }

    /** Build a user `AgentMessage` from a list of content blocks. */
    public userMessage(content: AgentContentBlock[]): AgentMessage {
        return {
            role: 'user',
            entries: content.map(c => ({ kind: 'content', content: c })),
        };
    }

    protected dispatchAgentUpdate(event: SignalEvent, status: AgentStatus) {
        this.agentSignal.dispatch(event, { status, config: this.getAgentConfigSync() });
    }

    // ── Config ──

    @exposed @info("Configure the agent backend and connect")
    @input(AgentConfigSchema)
    public async setAgentConfig(config: AgentConfig): Promise<void> {
        this.store.setItem(AGENT_CONFIG_KEY, config);
        await this.store.save();
        this._onStop();
        this.rejectAllPermissions();
        this.dispatchAgentUpdate(SignalEvent.ADD, { connectionStatus: 'connecting' });
        try {
            await this._onStart(config);
        } catch (err: any) {
            console.error('[AgentService] Failed to connect after config change:', err.message);
            this.dispatchAgentUpdate(SignalEvent.ERROR, { connectionStatus: 'error', error: err.message });
        }
    }

    @exposed @info("Get the current agent configuration")
    @output(Sch.Nullable(AgentConfigSchema))
    public async getAgentConfig(): Promise<AgentConfig | null> {
        return this.getAgentConfigSync();
    }

    @exposed @info("Remove the agent configuration and disconnect")
    public async removeAgentConfig(): Promise<void> {
        this.store.deleteKey(AGENT_CONFIG_KEY);
        await this.store.save();
        this._onStop();
        this.rejectAllPermissions();
        this.dispatchAgentUpdate(SignalEvent.REMOVE, await this._getStatus());
    }

    // ── Status ──

    @exposed @info("Get agent connection status")
    @output(AgentStatusSchema)
    public async getStatus(): Promise<AgentStatus> { return this._getStatus(); }

    @exposed @info("Get preconfigured agent presets")
    @output(Sch.Array(AgentConfigSchema))
    public async getAgentConfigPresets(): Promise<AgentConfig[]> { return agentPresets; }

    // ── Chats ──

    @exposed @info("Start a new chat")
    @wfApi
    @input(Sch.Name('cwd', Sch.Optional(Sch.String)))
    @output(ChatInfoSchema)
    public async newChat(cwd?: string): Promise<ChatInfo> { return this._newChat(cwd); }

    @exposed @info("List all chats")
    @wfApi
    @output(Sch.Array(ChatInfoSchema))
    public async listChats(): Promise<ChatInfo[]> { return this._listChats(); }

    @exposed @info("Get chat info by ID")
    @wfApi
    @input(Sch.Name('chatId', Sch.String))
    @output(Sch.Nullable(ChatInfoSchema))
    public async getChat(chatId: string): Promise<ChatInfo | null> { return this._getChat(chatId); }

    @exposed @info("Get all messages in a chat")
    @wfApi
    @input(Sch.Name('chatId', Sch.String))
    @output(Sch.Array(AgentMessageSchema))
    public async getChatMessages(chatId: string): Promise<AgentMessage[]> { return this._getChatMessages(chatId); }

    // ── Chat Config ──

    @exposed @info("Get configurable options for a chat (model, mode, etc.)")
    @wfApi
    @input(Sch.Name('chatId', Sch.String))
    @output(Sch.Array(ChatConfigOptionSchema))
    public async getChatConfig(chatId: string): Promise<ChatConfigOption[]> { return this._getChatConfig(chatId); }

    @exposed @info("Set a config option for a chat")
    @wfApi
    @input(Sch.Name('chatId', Sch.String), Sch.Name('key', Sch.String), Sch.Name('value', Sch.String))
    public async setChatConfig(chatId: string, key: string, value: string): Promise<void> { return this._setChatConfig(chatId, key, value); }

    // ── Messages ──

    @exposed @info("Send a text message to a chat")
    @wfApi
    @input(Sch.Name('chatId', Sch.String), Sch.Name('text', Sch.String))
    @output(Sch.Object({ stopReason: Sch.String }))
    public async sendMessage(chatId: string, text: string): Promise<{ stopReason: AgentStopReason }> {
        return this.sendMessageWithContent(chatId, [{ type: 'text', text }]);
    }

    @exposed @info("Send a message with rich content to a chat")
    @wfApi
    @input(Sch.Name('chatId', Sch.String), Sch.Name('content', Sch.Array(AgentContentBlockSchema)))
    @output(Sch.Object({ stopReason: Sch.String }))
    public async sendMessageWithContent(chatId: string, content: AgentContentBlock[]): Promise<{ stopReason: AgentStopReason }> {
        return this._sendMessage(chatId, content);
    }

    @exposed @info("Cancel an ongoing message generation")
    @wfApi
    @input(Sch.Name('chatId', Sch.String))
    public async cancelMessage(chatId: string): Promise<void> { return this._cancelMessage(chatId); }

    @exposed @info("Mark a chat as read")
    @input(Sch.Name('chatId', Sch.String))
    public async markRead(chatId: string): Promise<void> { return this._markRead(chatId); }

    // ── Permissions ──

    @exposed @info("Respond to a permission request")
    @input(Sch.Name('chatId', Sch.String), Sch.Name('optionId', Sch.String))
    public async respondToPermission(chatId: string, optionId: string): Promise<void> {
        const pending = this.pendingPermissions.get(chatId);
        if (pending) {
            pending.resolve({ outcome: { outcome: 'selected', optionId } });
            this.pendingPermissions.delete(chatId);
        }
    }

    // ── Permission handling (called by subclass) ──

    protected handlePermissionRequest(chatId: string, toolCall: AgentToolCall, options: AgentPermissionOption[]): Promise<{ outcome: { outcome: string; optionId?: string } }> {
        const request: AgentPermissionRequest = { chatId, toolCall, options };
        const promise = new Promise<{ outcome: { outcome: string; optionId?: string } }>((resolve, reject) => {
            this.pendingPermissions.set(chatId, { resolve, reject, request });
        });
        // Dispatch chatInfoSignal after storing, so pendingPermission is included
        this.chatInfoSignal.dispatch(this._buildChatInfo(chatId));
        return promise;
    }

    /** Build a ChatInfo for the given chatId. Override in subclass to provide full data. */
    protected _buildChatInfo(chatId: string): ChatInfo {
        return {
            chatId,
            title: null,
            cwd: '',
            status: this.hasPendingPermission(chatId) ? 'asking' : 'idle',
            isUnread: false,
            pendingPermission: this.getPendingPermissionRequest(chatId),
            updatedAt: null,
        };
    }

    protected rejectAllPermissions(): void {
        for (const [, pending] of this.pendingPermissions) {
            pending.reject(new Error('Agent disconnected'));
        }
        this.pendingPermissions.clear();
    }

    protected cancelPendingPermission(chatId: string): void {
        const pending = this.pendingPermissions.get(chatId);
        if (pending) {
            pending.resolve({ outcome: { outcome: 'cancelled' } });
            this.pendingPermissions.delete(chatId);
        }
    }

    protected getAgentConfigSync(): AgentConfig | null {
        return this.store?.getItem<AgentConfig>(AGENT_CONFIG_KEY) ?? null;
    }

    protected hasPendingPermission(chatId: string): boolean {
        return this.pendingPermissions.has(chatId);
    }

    protected getPendingPermissionRequest(chatId: string): AgentPermissionRequest | null {
        return this.pendingPermissions.get(chatId)?.request ?? null;
    }

    // ── Abstract methods (implemented per platform) ──

    protected async _onStart(config: AgentConfig): Promise<void> { }
    protected _onStop(): void { }
    protected async _getStatus(): Promise<AgentStatus> { return { connectionStatus: 'disconnected' }; }
    protected async _newChat(cwd?: string): Promise<ChatInfo> { throw new Error('Not supported.'); }
    protected async _listChats(): Promise<ChatInfo[]> { return []; }
    protected async _getChat(chatId: string): Promise<ChatInfo | null> { return null; }
    protected async _getChatMessages(chatId: string): Promise<AgentMessage[]> { return []; }
    protected async _sendMessage(chatId: string, content: AgentContentBlock[]): Promise<{ stopReason: AgentStopReason }> { throw new Error('Not supported.'); }
    protected async _cancelMessage(chatId: string): Promise<void> { }
    protected async _markRead(chatId: string): Promise<void> { }
    protected async _getChatConfig(chatId: string): Promise<ChatConfigOption[]> { return []; }
    protected async _setChatConfig(chatId: string, key: string, value: string): Promise<void> { }
}
