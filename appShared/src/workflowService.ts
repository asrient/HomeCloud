import { Service, exposed, serviceStartMethod, serviceStopMethod } from './servicePrimatives';
import Signal from './signals';
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
} from './types';

export abstract class WorkflowService extends Service {
    public executionStartSignal = new Signal<[WorkflowExecution]>({ isExposed: true, isAllowAll: false });
    public executionEndSignal = new Signal<[WorkflowExecution]>({ isExposed: true, isAllowAll: false });
    public init() {
        this._init();
    }

    @serviceStartMethod
    public async start() {
    }

    @serviceStopMethod
    public async stop() {
    }

    @exposed
    public async isAvailable(): Promise<boolean> {
        return false;
    }

    @exposed
    public async readScript(workflowId: string): Promise<string> {
        throw new Error('Not implemented');
    }

    @exposed
    public async writeScript(workflowId: string, script: string): Promise<void> {
        throw new Error('Not implemented');
    }

    @exposed
    public async listWorkflows(params?: ListWorkflowsParams): Promise<WorkflowConfig[]> {
        return [];
    }

    @exposed
    public async getWorkflowConfig(workflowId: string): Promise<WorkflowConfig> {
        throw new Error('Not implemented');
    }

    @exposed
    public async createWorkflow(data: WorkflowCreateRequest): Promise<WorkflowConfig> {
        throw new Error('Not implemented');
    }

    @exposed
    public async updateWorkflow(data: WorkflowUpdatePayload): Promise<WorkflowConfig> {
        throw new Error('Not implemented');
    }

    @exposed
    public async deleteWorkflow(workflowId: string): Promise<void> {
        throw new Error('Not implemented');
    }

    @exposed
    public async executeWorkflow(workflowId: string, inputs: WorkflowInputs, maxWaitSec?: number): Promise<WorkflowExecution> {
        throw new Error('Not implemented');
    }

    @exposed
    public async executeScript(script: string, maxWaitSec?: number): Promise<WorkflowExecution> {
        throw new Error('Not implemented');
    }

    @exposed
    public async getWorkflowExecution(executionId: string): Promise<WorkflowExecution> {
        throw new Error('Not implemented');
    }

    @exposed
    public async cancelWorkflowExecution(executionId: string): Promise<void> {
        throw new Error('Not implemented');
    }

    @exposed
    public async createTrigger(data: WorkflowTriggerCreateRequest): Promise<WorkflowTrigger> {
        throw new Error('Not implemented');
    }

    @exposed
    public async updateTrigger(data: WorkflowTriggerUpdatePayload): Promise<WorkflowTrigger> {
        throw new Error('Not implemented');
    }

    @exposed
    public async deleteTrigger(triggerId: string): Promise<void> {
        throw new Error('Not implemented');
    }

    @exposed
    public async listTriggers(params?: ListTriggersParams): Promise<WorkflowTrigger[]> {
        return [];
    }

    @exposed
    public async linkTrigger(workflowId: string, triggerId: string): Promise<void> {
        throw new Error('Not implemented');
    }

    @exposed
    public async unlinkTrigger(workflowId: string, triggerId: string): Promise<void> {
        throw new Error('Not implemented');
    }

    @exposed
    public async listWorkflowExecutions(params?: ListWorkflowExecutionsParams): Promise<WorkflowExecution[]> {
        throw new Error('Not implemented');
    }

    @exposed
    public async readExecutionLog(executionId: string): Promise<string> {
        throw new Error('Not implemented');
    }
}
