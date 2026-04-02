import {
    AgentService,
} from "shared/agentService";
import type {
    AgentConfig,
    AgentInfo,
    AgentSessionInfo,
    AgentNewSessionResult,
    AgentPromptResult,
    AgentPromptContent,
    AgentPermissionResponse,
    AgentConfigOption,
    AgentSessionSignalEvent,
    AgentPermissionRequest,
    AgentStatus,
    AgentMcpServer,
} from "shared/types";
import { exposed } from "shared/servicePrimatives";
import type ConfigStorage from "shared/storage";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { ACPAgentHandle, type ACPAgentHandleOptions } from "./acpAgentHandle";

const AGENTS_STORE_NAME = 'agents';

type StoredAgentConfig = AgentConfig & { id: string };

export default class NodeAgentService extends AgentService {
    private agents = new Map<string, ACPAgentHandle>();
    private store: ConfigStorage;

    public override async init() {
        super.init();
        this.store = modules.ConfigStorage.getInstance(AGENTS_STORE_NAME);
        await this.store.load();
    }

    // ── Agent Management ──

    @exposed
    public override async isAvailable(): Promise<boolean> {
        return true;
    }

    @exposed
    public override async listAgents(): Promise<AgentInfo[]> {
        const saved = this.getSavedAgents();
        return saved.map(config => {
            const handle = this.agents.get(config.id);
            return this.buildAgentInfo(config, handle);
        });
    }

    @exposed
    public override async addAgent(config: AgentConfig): Promise<AgentInfo> {
        const id = randomBytes(6).toString('hex');
        const stored: StoredAgentConfig = { ...config, id };

        // Save to disk
        const saved = this.getSavedAgents();
        saved.push(stored);
        this.store.setItem('agents', saved);
        await this.store.save();

        // Create handle and start
        const handle = this.createHandle(stored);
        this.agents.set(id, handle);

        try {
            await handle.start();
        } catch (err) {
            console.error(`[NodeAgentService] Failed to start agent "${config.name}":`, err);
            // Agent is registered but in error state — user can retry
        }

        return this.buildAgentInfo(stored, handle);
    }

    @exposed
    public override async removeAgent(agentId: string): Promise<void> {
        const handle = this.agents.get(agentId);
        if (handle) {
            await handle.stop();
            this.agents.delete(agentId);
        }

        // Remove from disk
        const saved = this.getSavedAgents().filter(a => a.id !== agentId);
        this.store.setItem('agents', saved);
        await this.store.save();
    }

    @exposed
    public override async getAgent(agentId: string): Promise<AgentInfo | null> {
        const config = this.getSavedAgents().find(a => a.id === agentId);
        if (!config) return null;
        const handle = this.agents.get(agentId);
        return this.buildAgentInfo(config, handle);
    }

    // ── Session Management ──

    @exposed
    public override async listSessions(agentId: string, cwd?: string): Promise<AgentSessionInfo[]> {
        const handle = await this.ensureRunning(agentId);
        return handle.listSessions(cwd);
    }

    @exposed
    public override async newSession(agentId: string, cwd: string): Promise<AgentNewSessionResult> {
        const handle = await this.ensureRunning(agentId);
        // Resolve empty/~ cwd to homedir
        const resolvedCwd = (!cwd || cwd === '~') ? homedir() : cwd;
        return handle.newSession(resolvedCwd, this.getMcpServers());
    }

    @exposed
    public override async loadSession(agentId: string, sessionId: string, cwd: string): Promise<void> {
        const handle = await this.ensureRunning(agentId);
        await handle.loadSession(sessionId, cwd, this.getMcpServers());
    }

    @exposed
    public override async closeSession(agentId: string, sessionId: string): Promise<void> {
        const handle = await this.ensureRunning(agentId);
        await handle.closeSession(sessionId);
    }

    // ── Prompt & Interaction ──

    @exposed
    public override async sendMessage(agentId: string, sessionId: string, message: string): Promise<AgentPromptResult> {
        const handle = await this.ensureRunning(agentId);
        return handle.prompt(sessionId, [{ type: 'text', text: message }]);
    }

    @exposed
    public override async sendPrompt(agentId: string, sessionId: string, content: AgentPromptContent[]): Promise<AgentPromptResult> {
        const handle = await this.ensureRunning(agentId);
        return handle.prompt(sessionId, content);
    }

    @exposed
    public override async cancelPrompt(agentId: string, sessionId: string): Promise<void> {
        const handle = await this.ensureRunning(agentId);
        await handle.cancel(sessionId);
    }

    @exposed
    public override async respondToPermission(agentId: string, response: AgentPermissionResponse): Promise<void> {
        const handle = this.getHandle(agentId);
        handle.resolvePermission(response.toolCallId, response.selectedOptionId);
    }

    // ── Session Config ──

    @exposed
    public override async setSessionMode(agentId: string, sessionId: string, modeId: string): Promise<void> {
        const handle = await this.ensureRunning(agentId);
        await handle.setSessionMode(sessionId, modeId);
    }

    @exposed
    public override async setSessionConfigOption(agentId: string, sessionId: string, configId: string, value: string): Promise<AgentConfigOption[]> {
        const handle = await this.ensureRunning(agentId);
        return handle.setSessionConfigOption(sessionId, configId, value);
    }

    // ── Streaming ──

    @exposed
    public override async streamSession(agentId: string, sessionId: string): Promise<ReadableStream<Uint8Array>> {
        const handle = await this.ensureRunning(agentId);
        return handle.createSessionStream(sessionId);
    }

    // ── Private ──

    private getSavedAgents(): StoredAgentConfig[] {
        return (this.store.getItem('agents') as StoredAgentConfig[] | null) || [];
    }

    private getHandle(agentId: string): ACPAgentHandle {
        const handle = this.agents.get(agentId);
        if (!handle) {
            throw new Error(`Agent "${agentId}" not found.`);
        }
        return handle;
    }

    private async ensureRunning(agentId: string): Promise<ACPAgentHandle> {
        let handle = this.agents.get(agentId);

        if (!handle) {
            // Try to create from saved config
            const config = this.getSavedAgents().find(a => a.id === agentId);
            if (!config) {
                throw new Error(`Agent "${agentId}" not found.`);
            }
            handle = this.createHandle(config);
            this.agents.set(agentId, handle);
        }

        if (!handle.isRunning()) {
            await handle.start();
        }

        return handle;
    }

    private createHandle(config: StoredAgentConfig): ACPAgentHandle {
        return new ACPAgentHandle({
            id: config.id,
            name: config.name,
            command: config.command,
            args: config.args || [],
            env: config.env,
            description: config.description,
            defaultCwd: config.cwd || homedir(),
            onSessionEvent: (agentId, sessionId, event) => {
                this.sessionEventSignal.dispatch(agentId, sessionId, event);
            },
            onPermissionRequest: (request) => {
                this.permissionRequestSignal.dispatch(request);
            },
            onStatusChange: (agentId, status) => {
                this.agentStatusSignal.dispatch(agentId, status);
            },
        });
    }

    private buildAgentInfo(config: StoredAgentConfig, handle?: ACPAgentHandle | null): AgentInfo {
        const defaultCaps = {
            listSessions: false, loadSession: false, closeSession: false,
            resumeSession: false, forkSession: false,
            promptImage: false, promptAudio: false, promptEmbeddedContext: false,
        };

        return {
            id: config.id,
            name: config.name,
            description: config.description || '',
            command: config.command,
            args: config.args || [],
            capabilities: handle?.isRunning() ? handle.getCapabilities() : defaultCaps,
            status: handle?.getStatus() || 'stopped',
            agentName: handle?.getAgentInfo().name,
            agentVersion: handle?.getAgentInfo().version,
        };
    }
}
