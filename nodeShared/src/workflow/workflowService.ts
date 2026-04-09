import path from 'path';
import fsp from 'fs/promises';
import { Cron } from 'croner';
import { WorkflowService } from 'shared/workflowService';
import {
    McpServerInfo,
    WorkflowConfig,
    WorkflowCreateRequest,
    WorkflowExecution,
    WorkflowInputs,
    WorkflowTrigger,
    WorkflowTriggerCreateRequest,
    WorkflowTriggerUpdatePayload,
    WorkflowUpdatePayload,
    ListWorkflowsParams,
    ListWorkflowExecutionsParams,
    ListTriggersParams,
} from 'shared/types';
import { WorkflowRepository } from './repository';
import { WorkflowExecutor } from './executor';
import { McpHttpServer } from './mcpServer';
import { getScriptingDocMarkdown } from './doc';

const DEFAULT_MCP_PORT = 9637;

const DEFAULT_SCRIPT_TEMPLATE = `// Workflow script
// Access workflow context via global.ctx
// Call global.exit(success, message) to finish

const ctx = global.ctx;
console.log('Workflow started:', ctx.config?.name ?? 'Playground');
console.log('Inputs:', JSON.stringify(ctx.inputs));

// Your code here...

global.exit(true, 'Done');
`;

export default class NodeWorkflowService extends WorkflowService {
    private repo!: WorkflowRepository;
    private executor!: WorkflowExecutor;
    private workflowsDir!: string;
    private cronJobs = new Map<string, Cron>();
    private mcpServer = new McpHttpServer();

    public override init() {
        super.init();
        this.workflowsDir = path.join(modules.config.DATA_DIR, 'Workflows');
        this.repo = new WorkflowRepository(this.workflowsDir);
        this.executor = new WorkflowExecutor(this.repo, this.workflowsDir);
        this.executor.onExecutionStart = (exec) => this.executionStartSignal.dispatch(exec);
        this.executor.onExecutionComplete = (wfId, exec) => {
            this.executionEndSignal.dispatch(exec);
            this.purge(wfId);
        };
    }

    public override async start() {
        await this.repo.open();
        await super.start();
        await this.setupTriggers();
    }

    public override async stop() {
        this.teardownTriggers();
        await this.executor.terminateAll();
        await this.repo.close();
        await super.stop();
    }

    protected override async _isAvailable(): Promise<boolean> {
        return true;
    }

    protected override async _readScript(workflowId: string): Promise<string> {
        const scriptPath = path.join(this.workflowsDir, 'Scripts', `${workflowId}.js`);
        return fsp.readFile(scriptPath, 'utf-8');
    }

    protected override async _writeScript(workflowId: string, script: string): Promise<void> {
        await this.repo.getWorkflow(workflowId);
        const scriptPath = path.join(this.workflowsDir, 'Scripts', `${workflowId}.js`);
        await fsp.writeFile(scriptPath, script, 'utf-8');
        await this.repo.touchUpdatedAt(workflowId);
    }

    protected override async _listWorkflows(params?: ListWorkflowsParams): Promise<WorkflowConfig[]> {
        return this.repo.listWorkflows(params);
    }

    protected override async _getWorkflowConfig(workflowId: string): Promise<WorkflowConfig> {
        return this.repo.getWorkflow(workflowId);
    }

    protected override async _createWorkflow(data: WorkflowCreateRequest): Promise<WorkflowConfig> {
        const config = await this.repo.createWorkflow(data);
        const scriptsDir = path.join(this.workflowsDir, 'Scripts');
        await fsp.mkdir(scriptsDir, { recursive: true });
        await fsp.writeFile(path.join(scriptsDir, `${config.id}.js`), DEFAULT_SCRIPT_TEMPLATE, 'utf-8');
        return config;
    }

    protected override async _updateWorkflow(data: WorkflowUpdatePayload): Promise<WorkflowConfig> {
        return this.repo.updateWorkflow(data);
    }

    protected override async _deleteWorkflow(workflowId: string): Promise<void> {
        await this.executor.cancelExecution(workflowId).catch(() => { });
        await this.repo.deleteWorkflow(workflowId);
        const scriptPath = path.join(this.workflowsDir, 'Scripts', `${workflowId}.js`);
        await fsp.unlink(scriptPath).catch(() => { });
    }

    protected override async _executeWorkflow(workflowId: string, inputs: WorkflowInputs, maxWaitSec?: number): Promise<WorkflowExecution> {
        const config = await this.repo.getWorkflow(workflowId);
        if (!config.isEnabled) {
            throw new Error(`Workflow '${config.name}' is disabled`);
        }
        return this.executor.executeWorkflow(config, inputs, maxWaitSec);
    }

    protected override async _executeScript(script: string, maxWaitSec?: number): Promise<WorkflowExecution> {
        return this.executor.executeScript(script, maxWaitSec);
    }

    protected override async _getWorkflowExecution(executionId: string): Promise<WorkflowExecution> {
        return this.repo.getExecution(executionId);
    }

    protected override async _cancelWorkflowExecution(executionId: string): Promise<void> {
        return this.executor.cancelExecution(executionId);
    }

    protected override async _listWorkflowExecutions(params?: ListWorkflowExecutionsParams): Promise<WorkflowExecution[]> {
        return this.repo.listExecutions(params);
    }

    protected override async _readExecutionLog(executionId: string): Promise<string> {
        const logPath = path.join(this.workflowsDir, 'Logs', `${executionId}.log`);
        return fsp.readFile(logPath, 'utf-8').catch(() => '');
    }

    protected override async _listSecretKeys(): Promise<string[]> {
        return this.repo.listSecretKeys();
    }

    protected override async _setSecret(key: string, value: string): Promise<void> {
        return this.repo.setSecret(key, value);
    }

    protected override async _deleteSecret(key: string): Promise<void> {
        return this.repo.deleteSecret(key);
    }

    protected override async _createTrigger(data: WorkflowTriggerCreateRequest): Promise<WorkflowTrigger> {
        this.validateCron(data.data);
        const trigger = await this.repo.createTrigger(data);
        await this.rebuildTriggers();
        return trigger;
    }

    protected override async _updateTrigger(data: WorkflowTriggerUpdatePayload): Promise<WorkflowTrigger> {
        if (data.data !== undefined) this.validateCron(data.data);
        const trigger = await this.repo.updateTrigger(data);
        await this.rebuildTriggers();
        return trigger;
    }

    protected override async _deleteTrigger(triggerId: string): Promise<void> {
        await this.repo.deleteTrigger(triggerId);
        await this.rebuildTriggers();
    }

    protected override async _listTriggers(params?: ListTriggersParams): Promise<WorkflowTrigger[]> {
        return this.repo.listTriggers(params);
    }

    protected override async _linkTrigger(workflowId: string, triggerId: string): Promise<void> {
        await this.repo.linkTrigger(workflowId, triggerId);
        await this.rebuildTriggers();
    }

    protected override async _unlinkTrigger(workflowId: string, triggerId: string): Promise<void> {
        await this.repo.unlinkTrigger(workflowId, triggerId);
        await this.rebuildTriggers();
    }

    private async purge(workflowId: string | null): Promise<void> {
        try {
            const deletedIds = await this.repo.pruneExecutions(workflowId);
            const logsDir = path.join(this.workflowsDir, 'Logs');
            for (const id of deletedIds) {
                await fsp.unlink(path.join(logsDir, `${id}.log`)).catch(() => { });
            }
        } catch (err) {
            console.error('[WorkflowService] Purge error:', err);
        }
    }

    // --- Trigger scheduling ---

    private validateCron(expression: string): void {
        try {
            // Dry-run parse — throws if invalid
            new Cron(expression, { maxRuns: 0 });
        } catch {
            throw new Error(`Invalid cron expression: ${expression}`);
        }
    }

    private async setupTriggers(): Promise<void> {
        try {
            const triggers = await this.repo.listTriggers();
            for (const trigger of triggers) {
                if (trigger.type !== 'schedule') continue;
                try {
                    const job = new Cron(trigger.data, () => {
                        this.onTriggerFired(trigger).catch(err => {
                            console.error(`[WorkflowService] Trigger ${trigger.id} error:`, err);
                        });
                    });
                    this.cronJobs.set(trigger.id, job);
                } catch (err) {
                    console.error(`[WorkflowService] Failed to schedule trigger ${trigger.id}:`, err);
                }
            }
            console.log(`[WorkflowService] Scheduled ${this.cronJobs.size} trigger(s).`);
        } catch (err) {
            console.error('[WorkflowService] setupTriggers error:', err);
        }
    }

    private teardownTriggers(): void {
        for (const [id, job] of this.cronJobs) {
            job.stop();
        }
        this.cronJobs.clear();
    }

    private async rebuildTriggers(): Promise<void> {
        if (!this.isServiceRunning()) return;
        this.teardownTriggers();
        await this.setupTriggers();
    }

    private async onTriggerFired(trigger: WorkflowTrigger): Promise<void> {
        const workflows = await this.repo.getWorkflowsForTrigger(trigger.id);
        for (const config of workflows) {
            this.executor.executeWorkflow(config, {}, undefined, trigger.id).catch(err => {
                console.error(`[WorkflowService] Triggered execution failed for workflow ${config.id}:`, err);
            });
        }
    }

    // --- MCP Server ---

    private registerMcpTools(): void {
        const docText = getScriptingDocMarkdown();

        this.mcpServer.registerTool({
            name: 'execute_script',
            description:
                'Execute a script and get a result. Max duration: 5mins.\n\n' +
                docText,
            inputSchema: {
                type: 'object',
                properties: {
                    script: { type: 'string', description: 'JavaScript code to execute' },
                },
                required: ['script'],
            },
            callback: async ({ script }) => {
                let execution: WorkflowExecution;
                try {
                    execution = await this._executeScript(script, 5 * 60);
                } catch (err: any) {
                    return { status: 'error', message: err.message || String(err) };
                }
                const result = {
                    status: execution.result?.status ?? 'error',
                    message: execution.result?.message,
                    debugLog: null,
                };
                if (result.status !== 'ok') {
                    try { result.debugLog = await this._readExecutionLog(execution.id); } catch { }
                }
                return result;
            },
        });
    }

    protected override async _startMcpServer(): Promise<void> {
        if (this.mcpServer.isRunning) return;
        this.registerMcpTools();
        await this.mcpServer.start(DEFAULT_MCP_PORT, modules.config.VERSION);
    }

    protected override async _stopMcpServer(): Promise<void> {
        await this.mcpServer.stop();
    }

    protected override async _getMcpServerInfo(): Promise<McpServerInfo> {
        return {
            isRunning: this.mcpServer.isRunning,
            port: this.mcpServer.isRunning ? this.mcpServer.port : null,
            url: this.mcpServer.isRunning ? `http://127.0.0.1:${this.mcpServer.port}` : null,
        };
    }
}
