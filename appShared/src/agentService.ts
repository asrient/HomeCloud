import { Service, serviceStartMethod, serviceStopMethod, exposed, info, input, output } from './servicePrimatives';
import Signal from './signals';
import ConfigStorage from './storage';
import {
    Sch,
    AgentConfig, AgentStatus, ChatInfo, ChatConfigOption, AgentMessage, AgentToolCall,
    AgentConfigSchema, ChatInfoSchema, AgentStatusSchema, ChatConfigOptionSchema, AgentContentBlockSchema, AgentMessageSchema,
    AgentChatUpdate,
    AgentContentBlock,
    AgentPermissionOption,
    AgentPermissionRequest,
    AgentStopReason,
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
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class AgentService extends Service {
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
            try {
                await this._onStart(config);
            } catch (err: any) {
                console.error('[AgentService] Failed to auto-connect:', err.message);
            }
        }
    }

    @serviceStopMethod
    public async stop() {
        this._onStop();
        this.rejectAllPermissions();
    }

    // ── Signals ──

    public statusSignal = new Signal<[AgentStatus]>({ isExposed: true, isAllowAll: false });
    public chatInfoSignal = new Signal<[ChatInfo]>({ isExposed: true, isAllowAll: false });
    public messageStreamSignal = new Signal<[string, AgentChatUpdate]>({ isExposed: true, isAllowAll: false });
    public permissionRequestSignal = new Signal<[AgentPermissionRequest]>({ isExposed: true, isAllowAll: false });

    // ── Config ──

    @exposed @info("Configure the agent backend and connect")
    @input(AgentConfigSchema)
    public async setAgentConfig(config: AgentConfig): Promise<void> {
        this.store.setItem(AGENT_CONFIG_KEY, config);
        await this.store.save();
        this._onStop();
        this.rejectAllPermissions();
        try {
            await this._onStart(config);
        } catch (err: any) {
            console.error('[AgentService] Failed to connect after config change:', err.message);
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
        this.statusSignal.dispatch(await this._getStatus());
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
    @input(Sch.Name('cwd', Sch.Optional(Sch.String)))
    @output(ChatInfoSchema)
    public async newChat(cwd?: string): Promise<ChatInfo> { return this._newChat(cwd); }

    @exposed @info("List all chats")
    @output(Sch.Array(ChatInfoSchema))
    public async listChats(): Promise<ChatInfo[]> { return this._listChats(); }

    @exposed @info("Get chat info by ID")
    @input(Sch.Name('chatId', Sch.String))
    @output(Sch.Nullable(ChatInfoSchema))
    public async getChat(chatId: string): Promise<ChatInfo | null> { return this._getChat(chatId); }

    @exposed @info("Get all messages in a chat")
    @input(Sch.Name('chatId', Sch.String))
    @output(Sch.Array(AgentMessageSchema))
    public async getChatMessages(chatId: string): Promise<AgentMessage[]> { return this._getChatMessages(chatId); }

    // ── Chat Config ──

    @exposed @info("Get configurable options for a chat (model, mode, etc.)")
    @input(Sch.Name('chatId', Sch.String))
    @output(Sch.Array(ChatConfigOptionSchema))
    public async getChatConfig(chatId: string): Promise<ChatConfigOption[]> { return this._getChatConfig(chatId); }

    @exposed @info("Set a config option for a chat")
    @input(Sch.Name('chatId', Sch.String), Sch.Name('key', Sch.String), Sch.Name('value', Sch.String))
    public async setChatConfig(chatId: string, key: string, value: string): Promise<void> { return this._setChatConfig(chatId, key, value); }

    // ── Messages ──

    @exposed @info("Send a text message to a chat")
    @input(Sch.Name('chatId', Sch.String), Sch.Name('text', Sch.String))
    @output(Sch.Object({ stopReason: Sch.String }))
    public async sendMessage(chatId: string, text: string): Promise<{ stopReason: AgentStopReason }> {
        return this.sendMessageWithContent(chatId, [{ type: 'text', text }]);
    }

    @exposed @info("Send a message with rich content to a chat")
    @input(Sch.Name('chatId', Sch.String), Sch.Name('content', Sch.Array(AgentContentBlockSchema)))
    @output(Sch.Object({ stopReason: Sch.String }))
    public async sendMessageWithContent(chatId: string, content: AgentContentBlock[]): Promise<{ stopReason: AgentStopReason }> {
        return this._sendMessage(chatId, content);
    }

    @exposed @info("Cancel an ongoing message generation")
    @input(Sch.Name('chatId', Sch.String))
    public async cancelMessage(chatId: string): Promise<void> { return this._cancelMessage(chatId); }

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
        this.permissionRequestSignal.dispatch({ chatId, toolCall, options });
        return new Promise((resolve, reject) => {
            this.pendingPermissions.set(chatId, { resolve, reject });
        });
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
    protected async _getChatConfig(chatId: string): Promise<ChatConfigOption[]> { return []; }
    protected async _setChatConfig(chatId: string, key: string, value: string): Promise<void> { }
}
