import path from 'path';
import os from 'os';
import fsp from 'fs/promises';
import {
    AgentConfig,
    AgentStatus,
    AgentMessage,
    AgentContentBlock,
    AgentStopReason,
    AgentToolCall,
    ChatInfo,
    ChatStatus,
    ChatConfigOption,
    AgentChatUpdate,
} from 'shared/types';
import { AgentService } from 'shared/agentService';
import { AcpClient } from './acpClient';

type ActiveTurn = {
    pendingMessage: AgentMessage;
};

export default class NodeAgentService extends AgentService {
    private client: AcpClient | null = null;
    private activeTurns = new Map<string, ActiveTurn>();
    private chatsDir: string = '';
    private sessionConfigs = new Map<string, any[]>();

    // ── Lifecycle ──

    protected override async _onStart(config: AgentConfig): Promise<void> {
        this.chatsDir = path.join(modules.config.DATA_DIR, 'AgentChats');
        // Clear chat files on every launch (agent is source of truth)
        await fsp.rm(this.chatsDir, { recursive: true, force: true });
        await fsp.mkdir(this.chatsDir, { recursive: true });

        this.destroyClient();
        const client = new AcpClient();

        client.on('status', async () => {
            this.statusSignal.dispatch(await this._getStatus());
        });

        client.on('notification', (method: string, params: any) => {
            if (method === 'session/update' && params?.sessionId && params?.update) {
                this.handleSessionUpdate(params.sessionId, params.update);
            }
        });

        client.on('exit', async () => {
            for (const chatId of this.activeTurns.keys()) {
                this.chatStatusSignal.dispatch(chatId, 'error');
            }
            this.rejectAllPermissions();
            this.activeTurns.clear();
            this.statusSignal.dispatch(await this._getStatus());
        });

        client.onRequest(async (method, params) => {
            switch (method) {
                case 'session/request_permission': {
                    const { sessionId, toolCall, options } = params;
                    this.chatStatusSignal.dispatch(sessionId, 'asking');
                    const permResult = await this.handlePermissionRequest(sessionId, toolCall, options);
                    if (this.activeTurns.has(sessionId)) {
                        this.chatStatusSignal.dispatch(sessionId, 'working');
                    }
                    return permResult;
                }
                default: {
                    const err = new Error(`Method not found: ${method}`);
                    (err as any).code = -32601;
                    throw err;
                }
            }
        });

        this.client = client;
        await client.connect(config);
    }

    protected override _onStop(): void {
        for (const chatId of this.activeTurns.keys()) {
            this.chatStatusSignal.dispatch(chatId, 'idle');
        }
        this.destroyClient();
        this.activeTurns.clear();
        this.sessionConfigs.clear();
        this.statusSignal.dispatch({ connectionStatus: 'disconnected' });
    }

    protected override async _getStatus(): Promise<AgentStatus> {
        return {
            connectionStatus: this.client?.status ?? 'disconnected',
            agentInfo: this.client?.agentInfo ?? null,
            error: this.client?.error ?? null,
        };
    }

    // ── Chats ──

    protected override async _newChat(cwd?: string): Promise<ChatInfo> {
        const resolvedCwd = cwd ?? await this.getDefaultCwd();
        const mcpServers = await this.getMcpServers();
        const result = await this.requireClient().request('session/new', { cwd: resolvedCwd, mcpServers });
        const chatId = result.sessionId as string;
        if (result.configOptions) this.sessionConfigs.set(chatId, result.configOptions);
        const info: ChatInfo = { chatId, title: null, cwd: resolvedCwd, status: 'idle', updatedAt: new Date().toISOString() };
        await this.writeChatFile(chatId, []);
        return info;
    }

    protected override async _listChats(): Promise<ChatInfo[]> {
        if (!this.client?.capabilities?.sessionCapabilities?.list) return [];
        const result = await this.requireClient().request('session/list', {});
        return (result.sessions ?? []).map((s: any) => ({
            chatId: s.sessionId,
            title: s.title ?? null,
            cwd: s.cwd,
            status: this.getChatStatus(s.sessionId),
            updatedAt: s.updatedAt ?? null,
        }));
    }

    protected override async _getChat(chatId: string): Promise<ChatInfo | null> {
        const chats = await this._listChats();
        return chats.find(c => c.chatId === chatId) ?? null;
    }

    protected override async _getChatMessages(chatId: string): Promise<AgentMessage[]> {
        // Check local file first
        const existing = await this.readChatFile(chatId);
        if (existing) {
            const turn = this.activeTurns.get(chatId);
            return turn ? [...existing, turn.pendingMessage] : existing;
        }

        // No local file — replay from agent if supported
        if (!this.client?.capabilities?.loadSession) throw new Error('Chat history not available');

        const chatInfo = await this._getChat(chatId);
        if (!chatInfo) return [];

        const messages = await this.replaySession(chatId, chatInfo.cwd);
        return messages;
    }

    // ── Messages ──

    protected override async _sendMessage(chatId: string, content: AgentContentBlock[]): Promise<{ stopReason: AgentStopReason }> {
        // Ensure session is loaded (will replay if needed)
        await this._getChatMessages(chatId);

        // Record user message
        const userMsg: AgentMessage = { role: 'user', content };
        await this.appendMessage(chatId, userMsg);

        // Start accumulating assistant message
        const pendingMessage: AgentMessage = { role: 'assistant', content: [], toolCalls: [], thoughts: [] };
        this.activeTurns.set(chatId, { pendingMessage });
        this.chatStatusSignal.dispatch(chatId, 'working');

        // Send prompt
        const result = await this.requireClient().request('session/prompt', {
            sessionId: chatId,
            prompt: content,
        });

        // Finalize assistant message
        const turn = this.activeTurns.get(chatId);
        if (turn) {
            turn.pendingMessage.stopReason = result.stopReason;
            // Clean up empty arrays
            if (!turn.pendingMessage.toolCalls?.length) delete turn.pendingMessage.toolCalls;
            if (!turn.pendingMessage.thoughts?.length) delete turn.pendingMessage.thoughts;
            if (!turn.pendingMessage.plan?.length) delete turn.pendingMessage.plan;
            await this.appendMessage(chatId, turn.pendingMessage);
            this.activeTurns.delete(chatId);
        }
        this.chatStatusSignal.dispatch(chatId, 'idle');

        return { stopReason: result.stopReason };
    }

    protected override async _cancelMessage(chatId: string): Promise<void> {
        if (!this.client?.isReady) return;
        // Per ACP spec: client MUST respond to pending permission requests with cancelled
        this.cancelPendingPermission(chatId);
        this.client.notify('session/cancel', { sessionId: chatId });
        this.chatStatusSignal.dispatch(chatId, 'idle');
    }

    // ── Chat Config ──

    protected override async _getChatConfig(chatId: string): Promise<ChatConfigOption[]> {
        const acpOpts = this.sessionConfigs.get(chatId);
        if (!acpOpts) return [];
        return acpOpts.filter((o: any) => o.type === 'select').map((o: any) => {
            const values = Array.isArray(o.options)
                ? o.options.map((v: any) =>
                    v.group ? v.options.map((gv: any) => ({ value: gv.value, name: gv.name })) : ({ value: v.value, name: v.name })
                ).flat()
                : [];
            return { key: o.id, name: o.name, currentValue: o.currentValue, values };
        });
    }

    protected override async _setChatConfig(chatId: string, key: string, value: string): Promise<void> {
        const result = await this.requireClient().request('session/set_config_option', {
            sessionId: chatId,
            configId: key,
            value,
        });
        if (result.configOptions) this.sessionConfigs.set(chatId, result.configOptions);
    }

    // ── ACP session/update → accumulate + signal ──

    private handleSessionUpdate(sessionId: string, update: any): void {
        const chatId = sessionId;
        const turn = this.activeTurns.get(chatId);

        // Accumulate into pending assistant message
        if (turn) {
            const msg = turn.pendingMessage;
            switch (update.sessionUpdate) {
                case 'agent_message_chunk':
                    msg.content.push(update.content);
                    break;
                case 'agent_thought_chunk':
                    if (!msg.thoughts) msg.thoughts = [];
                    msg.thoughts.push(update.content);
                    break;
                case 'tool_call': {
                    if (!msg.toolCalls) msg.toolCalls = [];
                    const { sessionUpdate: _, ...tc } = update;
                    msg.toolCalls.push(tc as AgentToolCall);
                    break;
                }
                case 'tool_call_update': {
                    if (!msg.toolCalls) msg.toolCalls = [];
                    const { sessionUpdate: _, ...tcUpdate } = update;
                    const idx = msg.toolCalls.findIndex((t: AgentToolCall) => t.toolCallId === tcUpdate.toolCallId);
                    if (idx >= 0) Object.assign(msg.toolCalls[idx], tcUpdate);
                    else msg.toolCalls.push(tcUpdate as AgentToolCall);
                    break;
                }
                case 'plan':
                    msg.plan = update.entries;
                    break;
            }
        }

        // Update stored config if agent pushes config changes
        if (update.sessionUpdate === 'config_option_update' && update.configOptions) {
            this.sessionConfigs.set(chatId, update.configOptions);
        }

        // Dispatch live stream signal (skip user_message_chunk — only used during replay)
        const mapped = this.mapToStreamUpdate(update);
        if (mapped) {
            this.messageStreamSignal.dispatch(chatId, mapped);
        }
    }

    private mapToStreamUpdate(update: any): AgentChatUpdate | null {
        const { sessionUpdate, ...rest } = update;
        switch (sessionUpdate) {
            case 'agent_message_chunk': return { kind: 'agent_message_chunk', ...rest };
            case 'agent_thought_chunk': return { kind: 'agent_thought_chunk', ...rest };
            case 'tool_call': return { kind: 'tool_call', ...rest };
            case 'tool_call_update': return { kind: 'tool_call_update', ...rest };
            case 'plan': return { kind: 'plan', ...rest };
            case 'session_info_update': return { kind: 'chat_info_update', ...rest };
            default: return null;
        }
    }

    // ── session/load replay ──

    private async replaySession(chatId: string, cwd: string): Promise<AgentMessage[]> {
        const messages: AgentMessage[] = [];
        let currentMsg: AgentMessage | null = null;

        const finalizeCurrent = () => {
            if (currentMsg) {
                if (!currentMsg.toolCalls?.length) delete currentMsg.toolCalls;
                if (!currentMsg.thoughts?.length) delete currentMsg.thoughts;
                if (!currentMsg.plan?.length) delete currentMsg.plan;
                messages.push(currentMsg);
                currentMsg = null;
            }
        };

        // Temporarily intercept notifications for this session during replay
        const replayHandler = (method: string, params: any) => {
            if (method !== 'session/update' || params?.sessionId !== chatId) return;
            const update = params.update;
            switch (update?.sessionUpdate) {
                case 'user_message_chunk':
                    finalizeCurrent();
                    currentMsg = { role: 'user', content: [update.content] };
                    break;
                case 'agent_message_chunk':
                    if (!currentMsg || currentMsg.role !== 'assistant') {
                        finalizeCurrent();
                        currentMsg = { role: 'assistant', content: [], toolCalls: [], thoughts: [] };
                    }
                    currentMsg.content.push(update.content);
                    break;
                case 'agent_thought_chunk':
                    if (!currentMsg || currentMsg.role !== 'assistant') {
                        finalizeCurrent();
                        currentMsg = { role: 'assistant', content: [], toolCalls: [], thoughts: [] };
                    }
                    if (!currentMsg.thoughts) currentMsg.thoughts = [];
                    currentMsg.thoughts.push(update.content);
                    break;
                case 'tool_call': {
                    if (!currentMsg || currentMsg.role !== 'assistant') {
                        finalizeCurrent();
                        currentMsg = { role: 'assistant', content: [], toolCalls: [], thoughts: [] };
                    }
                    if (!currentMsg.toolCalls) currentMsg.toolCalls = [];
                    const { sessionUpdate: _, ...tc } = update;
                    currentMsg.toolCalls.push(tc as AgentToolCall);
                    break;
                }
                case 'tool_call_update': {
                    if (currentMsg?.role === 'assistant' && currentMsg.toolCalls) {
                        const { sessionUpdate: _, ...tcUpdate } = update;
                        const idx = currentMsg.toolCalls.findIndex((t: AgentToolCall) => t.toolCallId === tcUpdate.toolCallId);
                        if (idx >= 0) Object.assign(currentMsg.toolCalls[idx], tcUpdate);
                        else currentMsg.toolCalls.push(tcUpdate as AgentToolCall);
                    }
                    break;
                }
                case 'plan':
                    if (currentMsg?.role === 'assistant') {
                        currentMsg.plan = update.entries;
                    }
                    break;
            }
        };

        this.client!.on('notification', replayHandler);
        try {
            const mcpServers = await this.getMcpServers();
            const result = await this.requireClient().request('session/load', {
                sessionId: chatId,
                cwd,
                mcpServers,
            });
            if (result?.configOptions) this.sessionConfigs.set(chatId, result.configOptions);
        } finally {
            this.client!.removeListener('notification', replayHandler);
        }

        finalizeCurrent();
        await this.writeChatFile(chatId, messages);
        return messages;
    }

    // ── File persistence ──

    private chatFilePath(chatId: string): string {
        // Sanitize chatId for filesystem safety
        const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(this.chatsDir, `${safe}.json`);
    }

    private async readChatFile(chatId: string): Promise<AgentMessage[] | null> {
        try {
            const data = await fsp.readFile(this.chatFilePath(chatId), 'utf-8');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    private async writeChatFile(chatId: string, messages: AgentMessage[]): Promise<void> {
        await fsp.writeFile(this.chatFilePath(chatId), JSON.stringify(messages), 'utf-8');
    }

    private async appendMessage(chatId: string, message: AgentMessage): Promise<void> {
        const messages = await this.readChatFile(chatId) ?? [];
        messages.push(message);
        await this.writeChatFile(chatId, messages);
    }

    // ── Helpers ──

    private requireClient(): AcpClient {
        if (!this.client?.isReady) throw new Error('Agent is not connected');
        return this.client;
    }

    private getChatStatus(chatId: string): ChatStatus {
        if (!this.activeTurns.has(chatId)) return 'idle';
        if (this.hasPendingPermission(chatId)) return 'asking';
        return 'working';
    }

    private async getDefaultCwd(): Promise<string> {
        const dir = path.join(os.homedir(), 'AI');
        await fsp.mkdir(dir, { recursive: true });
        return dir;
    }

    private async getMcpServers(): Promise<any[]> {
        const config = this.getAgentConfigSync();
        if (!config?.addWorkflowMcp) return [];
        try {
            const localSc = modules.getLocalServiceController();
            const mcpInfo = await localSc.workflow.getMcpServerInfo();
            if (mcpInfo.isRunning && mcpInfo.url) {
                return [{ type: 'http', name: 'HomeCloud', url: mcpInfo.url, headers: [] }];
            }
        } catch { }
        return [];
    }

    private destroyClient(): void {
        if (this.client) {
            this.client.destroy();
            this.client.removeAllListeners();
            this.client = null;
        }
    }
}
