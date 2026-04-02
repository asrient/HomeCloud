import { Service, exposed } from './servicePrimatives';
import Signal from './signals';
import type {
    AgentConfig,
    AgentInfo,
    AgentSessionInfo,
    AgentNewSessionResult,
    AgentPromptResult,
    AgentPromptContent,
    AgentPermissionResponse,
    AgentPermissionRequest,
    AgentConfigOption,
    AgentSessionSignalEvent,
    AgentStatus,
    AgentMcpServer,
} from './types';

export class AgentService extends Service {
    // Fires on lightweight session events (state change, title update, new tool call). [agentId, sessionId, event]
    public sessionEventSignal = new Signal<[string, string, AgentSessionSignalEvent]>({ isExposed: true, isAllowAll: false });

    // Fires when an agent requests permission for a tool call.
    public permissionRequestSignal = new Signal<[AgentPermissionRequest]>({ isExposed: true, isAllowAll: false });

    // Fires when an agent's status changes. [agentId, status]
    public agentStatusSignal = new Signal<[string, AgentStatus]>({ isExposed: true, isAllowAll: false });

    public init() {
        this._init();
    }

    @exposed
    public async isAvailable(): Promise<boolean> {
        return false;
    }

    // ── Agent Management ──

    @exposed
    public async listAgents(): Promise<AgentInfo[]> {
        return [];
    }

    @exposed
    public async addAgent(config: AgentConfig): Promise<AgentInfo> {
        throw new Error('Not supported.');
    }

    @exposed
    public async removeAgent(agentId: string): Promise<void> {
        throw new Error('Not supported.');
    }

    @exposed
    public async getAgent(agentId: string): Promise<AgentInfo | null> {
        return null;
    }

    // ── Session Management ──

    @exposed
    public async listSessions(agentId: string, cwd?: string): Promise<AgentSessionInfo[]> {
        return [];
    }

    @exposed
    public async newSession(agentId: string, cwd: string): Promise<AgentNewSessionResult> {
        throw new Error('Not supported.');
    }

    @exposed
    public async loadSession(agentId: string, sessionId: string, cwd: string): Promise<void> {
        throw new Error('Not supported.');
    }

    @exposed
    public async closeSession(agentId: string, sessionId: string): Promise<void> {
        throw new Error('Not supported.');
    }

    // ── Prompt & Interaction ──

    @exposed
    public async sendMessage(agentId: string, sessionId: string, message: string): Promise<AgentPromptResult> {
        throw new Error('Not supported.');
    }

    @exposed
    public async sendPrompt(agentId: string, sessionId: string, content: AgentPromptContent[]): Promise<AgentPromptResult> {
        throw new Error('Not supported.');
    }

    @exposed
    public async cancelPrompt(agentId: string, sessionId: string): Promise<void> {
        throw new Error('Not supported.');
    }

    @exposed
    public async respondToPermission(agentId: string, response: AgentPermissionResponse): Promise<void> {
        throw new Error('Not supported.');
    }

    // ── Session Config ──

    @exposed
    public async setSessionMode(agentId: string, sessionId: string, modeId: string): Promise<void> {
        throw new Error('Not supported.');
    }

    @exposed
    public async setSessionConfigOption(agentId: string, sessionId: string, configId: string, value: string): Promise<AgentConfigOption[]> {
        throw new Error('Not supported.');
    }

    // ── MCP Servers ──

    /**
     * Returns the list of MCP servers to pass to agents when creating/loading sessions.
     * Override to provide HomeCloud-specific tool servers.
     */
    public getMcpServers(): AgentMcpServer[] {
        return [];
    }

    // ── Streaming ──

    /**
     * Returns a ReadableStream of session events as newline-delimited JSON (Uint8Array).
     * Each chunk is a serialized AgentSessionEvent followed by a newline.
     * The stream stays open until the session is closed or the client cancels.
     */
    @exposed
    public async streamSession(agentId: string, sessionId: string): Promise<ReadableStream<Uint8Array>> {
        throw new Error('Not supported.');
    }
}
