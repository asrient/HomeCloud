import { Worker } from 'worker_threads';
import path from 'path';
import fsp from 'fs/promises';
import {
    WorkflowConfig,
    WorkflowExecution,
    WorkflowExecutionContext,
    WorkflowExecutionResult,
    WorkflowInputs,
} from 'shared/types.js';
import { WorkflowRepository } from './repository.js';

const BOOTSTRAP_PATH = path.join(__dirname, 'workerBootstrap.js');
const DEFAULT_MAX_EXEC_SECS = 300;

export class WorkflowExecutor {
    private repo: WorkflowRepository;
    private workflowsDir: string;
    private activeWorkers = new Map<string, Worker>();
    public onExecutionComplete: ((workflowId: string | null, execution: WorkflowExecution) => void) | null = null;
    public onExecutionStart: ((execution: WorkflowExecution) => void) | null = null;

    constructor(repo: WorkflowRepository, workflowsDir: string) {
        this.repo = repo;
        this.workflowsDir = workflowsDir;
    }

    async executeWorkflow(config: WorkflowConfig, inputs: WorkflowInputs, maxWaitSec?: number, triggerId?: string): Promise<WorkflowExecution> {
        const host = await modules.getLocalServiceController().app.peerInfo();
        const context: WorkflowExecutionContext = {
            inputs,
            config,
            host,
        };

        const logsDir = path.join(this.workflowsDir, 'Logs');
        await fsp.mkdir(logsDir, { recursive: true });

        const execution = await this.repo.createExecution(config.id, { inputs, triggerId });
        const logFilePath = path.join(logsDir, `${execution.id}.log`);
        this.onExecutionStart?.(execution);

        const timeoutSecs = config.maxExecTimeSecs ?? maxWaitSec ?? DEFAULT_MAX_EXEC_SECS;

        return this.runWorker(execution, {
            scriptPath: path.join(this.workflowsDir, 'Scripts', `${config.id}.js`),
            scriptContent: null,
            context,
            logFilePath,
        }, timeoutSecs);
    }

    async executeScript(script: string, maxWaitSec?: number): Promise<WorkflowExecution> {
        const host = await modules.getLocalServiceController().app.peerInfo();
        const context: WorkflowExecutionContext = {
            inputs: {},
            host,
        };

        const logsDir = path.join(this.workflowsDir, 'Logs');
        await fsp.mkdir(logsDir, { recursive: true });

        const execution = await this.repo.createExecution(null, { script });
        const logFilePath = path.join(logsDir, `${execution.id}.log`);
        this.onExecutionStart?.(execution);

        const timeoutSecs = maxWaitSec ?? DEFAULT_MAX_EXEC_SECS;

        return this.runWorker(execution, {
            scriptPath: null,
            scriptContent: script,
            context,
            logFilePath,
        }, timeoutSecs);
    }

    private async runWorker(
        execution: WorkflowExecution,
        workerData: { scriptPath: string | null; scriptContent: string | null; context: WorkflowExecutionContext; logFilePath: string },
        timeoutSecs: number,
    ): Promise<WorkflowExecution> {
        const executionId = execution.id;
        return new Promise<WorkflowExecution>(async (resolve) => {
            const worker = new Worker(BOOTSTRAP_PATH, { workerData });
            this.activeWorkers.set(executionId, worker);

            let settled = false;

            const finish = async (result: WorkflowExecutionResult) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.activeWorkers.delete(executionId);

                const endedAt = new Date();
                await this.repo.updateExecution(executionId, result, endedAt);

                const updated = await this.repo.getExecution(executionId);
                resolve(updated);
                this.onExecutionComplete?.(execution.workflowId, updated);
            };

            const timer = setTimeout(() => {
                if (!settled) {
                    worker.terminate();
                    finish({ status: 'timeout', message: `Exceeded ${timeoutSecs}s limit` });
                }
            }, timeoutSecs * 1000);

            worker.on('message', (msg: any) => {
                if (msg.type === 'result') {
                    finish(msg.result);
                }
            });

            worker.on('error', (err: Error) => {
                finish({ status: 'error', message: err.message });
            });

            worker.on('exit', (code: number) => {
                // If the worker exits without sending a result
                if (!settled) {
                    if (code === 0) {
                        finish({ status: 'ok' });
                    } else {
                        finish({ status: 'error', message: `Worker exited with code ${code}` });
                    }
                }
            });
        });
    }

    async cancelExecution(executionId: string): Promise<void> {
        const worker = this.activeWorkers.get(executionId);
        if (worker) {
            await worker.terminate();
            this.activeWorkers.delete(executionId);
        }
        const result: WorkflowExecutionResult = { status: 'cancelled' };
        await this.repo.updateExecution(executionId, result, new Date());
    }

    async terminateAll(): Promise<void> {
        for (const [id, worker] of this.activeWorkers) {
            try { await worker.terminate(); } catch { }
        }
        this.activeWorkers.clear();
    }
}
