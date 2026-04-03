import path from 'path';
import fsp from 'fs/promises';
import { Cron } from 'croner';
import { WorkflowService } from 'shared/workflowService.js';
import { exposed } from 'shared/servicePrimatives.js';
import {
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
} from 'shared/types.js';
import { WorkflowRepository } from './repository.js';
import { WorkflowExecutor } from './executor.js';

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

    @exposed
    public override async isAvailable(): Promise<boolean> {
        return true;
    }

    @exposed
    public override async readScript(workflowId: string): Promise<string> {
        const scriptPath = path.join(this.workflowsDir, 'Scripts', `${workflowId}.js`);
        return fsp.readFile(scriptPath, 'utf-8');
    }

    @exposed
    public override async writeScript(workflowId: string, script: string): Promise<void> {
        await this.repo.getWorkflow(workflowId); // ensure it exists
        const scriptPath = path.join(this.workflowsDir, 'Scripts', `${workflowId}.js`);
        await fsp.writeFile(scriptPath, script, 'utf-8');
        await this.repo.touchUpdatedAt(workflowId);
    }

    @exposed
    public override async listWorkflows(params?: ListWorkflowsParams): Promise<WorkflowConfig[]> {
        return this.repo.listWorkflows(params);
    }

    @exposed
    public override async getWorkflowConfig(workflowId: string): Promise<WorkflowConfig> {
        return this.repo.getWorkflow(workflowId);
    }

    @exposed
    public override async createWorkflow(data: WorkflowCreateRequest): Promise<WorkflowConfig> {
        const config = await this.repo.createWorkflow(data);
        const scriptsDir = path.join(this.workflowsDir, 'Scripts');
        await fsp.mkdir(scriptsDir, { recursive: true });
        await fsp.writeFile(path.join(scriptsDir, `${config.id}.js`), DEFAULT_SCRIPT_TEMPLATE, 'utf-8');
        return config;
    }

    @exposed
    public override async updateWorkflow(data: WorkflowUpdatePayload): Promise<WorkflowConfig> {
        return this.repo.updateWorkflow(data);
    }

    @exposed
    public override async deleteWorkflow(workflowId: string): Promise<void> {
        await this.executor.cancelExecution(workflowId).catch(() => { });
        await this.repo.deleteWorkflow(workflowId);
        const scriptPath = path.join(this.workflowsDir, 'Scripts', `${workflowId}.js`);
        await fsp.unlink(scriptPath).catch(() => { });
    }

    @exposed
    public override async executeWorkflow(workflowId: string, inputs: WorkflowInputs, maxWaitSec?: number): Promise<WorkflowExecution> {
        const config = await this.repo.getWorkflow(workflowId);
        if (!config.isEnabled) {
            throw new Error(`Workflow '${config.name}' is disabled`);
        }
        return this.executor.executeWorkflow(config, inputs, maxWaitSec);
    }

    @exposed
    public override async executeScript(script: string, maxWaitSec?: number): Promise<WorkflowExecution> {
        return this.executor.executeScript(script, maxWaitSec);
    }

    @exposed
    public override async getWorkflowExecution(executionId: string): Promise<WorkflowExecution> {
        return this.repo.getExecution(executionId);
    }

    @exposed
    public override async cancelWorkflowExecution(executionId: string): Promise<void> {
        return this.executor.cancelExecution(executionId);
    }

    @exposed
    public override async listWorkflowExecutions(params?: ListWorkflowExecutionsParams): Promise<WorkflowExecution[]> {
        return this.repo.listExecutions(params);
    }

    @exposed
    public override async readExecutionLog(executionId: string): Promise<string> {
        const logPath = path.join(this.workflowsDir, 'Logs', `${executionId}.log`);
        return fsp.readFile(logPath, 'utf-8').catch(() => '');
    }

    @exposed
    public override async createTrigger(data: WorkflowTriggerCreateRequest): Promise<WorkflowTrigger> {
        this.validateCron(data.data);
        const trigger = await this.repo.createTrigger(data);
        await this.rebuildTriggers();
        return trigger;
    }

    @exposed
    public override async updateTrigger(data: WorkflowTriggerUpdatePayload): Promise<WorkflowTrigger> {
        if (data.data !== undefined) this.validateCron(data.data);
        const trigger = await this.repo.updateTrigger(data);
        await this.rebuildTriggers();
        return trigger;
    }

    @exposed
    public override async deleteTrigger(triggerId: string): Promise<void> {
        await this.repo.deleteTrigger(triggerId);
        await this.rebuildTriggers();
    }

    @exposed
    public override async listTriggers(params?: ListTriggersParams): Promise<WorkflowTrigger[]> {
        return this.repo.listTriggers(params);
    }

    @exposed
    public override async linkTrigger(workflowId: string, triggerId: string): Promise<void> {
        await this.repo.linkTrigger(workflowId, triggerId);
        await this.rebuildTriggers();
    }

    @exposed
    public override async unlinkTrigger(workflowId: string, triggerId: string): Promise<void> {
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
}
