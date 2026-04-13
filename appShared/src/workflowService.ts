import { Service, exposed, info, input, output, serviceStartMethod, serviceStopMethod, wfApi } from './servicePrimatives';
import Signal from './signals';
import {
    Sch,
    MCP_AUTO_START_PREF_KEY,
    McpServerInfo,
    McpServerInfoSchema,
    SignalEvent,
    WorkflowConfig,
    WorkflowConfigSchema,
    WorkflowExecution,
    WorkflowExecutionSchema,
    WorkflowInputs,
    WorkflowInputsSchema,
    WorkflowTrigger,
    WorkflowTriggerSchema,
    WorkflowTriggerCreateRequest,
    WorkflowTriggerCreateRequestSchema,
    WorkflowTriggerUpdatePayload,
    WorkflowTriggerUpdatePayloadSchema,
    WorkflowSavePayload,
    WorkflowSavePayloadSchema,
    ListWorkflowsParams,
    ListWorkflowsParamsSchema,
    ListWorkflowExecutionsParams,
    ListWorkflowExecutionsParamsSchema,
    ListTriggersParams,
    ListTriggersParamsSchema,
} from './types';

export class WorkflowService extends Service {
    public executionStartSignal = new Signal<[WorkflowExecution]>({ isExposed: true, isAllowAll: false });
    public executionEndSignal = new Signal<[WorkflowExecution]>({ isExposed: true, isAllowAll: false });
    public workflowSignal = new Signal<[SignalEvent, WorkflowConfig]>({ isExposed: true, isAllowAll: false });
    public init() {
        this._init();
    }

    @serviceStartMethod
    public async start() {
        try {
            const localSc = modules.getLocalServiceController();
            const autoStart = localSc.app.getUserPreference(MCP_AUTO_START_PREF_KEY);
            if (autoStart) {
                await this._startMcpServer();
            }
        } catch (err: any) {
            console.error('[WorkflowService] Failed to auto-start MCP server:', err.message);
        }
    }

    @serviceStopMethod
    public async stop() {
    }

    // --- Exposed methods (final — do not override) ---

    @exposed @info("Check if workflow engine is available") @output(Sch.Boolean)
    public async isAvailable(): Promise<boolean> { return this._isAvailable(); }

    @exposed @info("List all workflow configurations") @input(Sch.Name('params', Sch.Optional(ListWorkflowsParamsSchema))) @output(Sch.Array(WorkflowConfigSchema))
    @wfApi
    public async listWorkflows(params?: ListWorkflowsParams): Promise<WorkflowConfig[]> { return this._listWorkflows(params); }

    @exposed @info("Get a workflow configuration by ID") @input(Sch.Name('workflowId', Sch.String)) @output(WorkflowConfigSchema)
    @wfApi
    public async getWorkflowConfig(workflowId: string): Promise<WorkflowConfig> { return this._getWorkflowConfig(workflowId); }

    @exposed @info("Create a new workflow") @input(Sch.Name('name', Sch.String), Sch.Name('dir', Sch.Optional(Sch.String))) @output(WorkflowConfigSchema)
    @wfApi
    public async createWorkflow(name: string, dir?: string): Promise<WorkflowConfig> {
        const config = await this._createWorkflow(name, dir);
        this.workflowSignal.dispatch(SignalEvent.ADD, config);
        return config;
    }

    @exposed @info("Update a workflow's configuration") @input(Sch.Name('id', Sch.String), Sch.Name('data', WorkflowSavePayloadSchema)) @output(WorkflowConfigSchema)
    @wfApi
    public async updateWorkflow(id: string, data: WorkflowSavePayload): Promise<WorkflowConfig> {
        const config = await this._updateWorkflow(id, data);
        this.workflowSignal.dispatch(SignalEvent.UPDATE, config);
        return config;
    }

    @exposed @info("Delete a workflow and its script and logs") @input(Sch.Name('workflowId', Sch.String))
    @wfApi
    public async deleteWorkflow(workflowId: string): Promise<void> {
        const config = await this._getWorkflowConfig(workflowId);
        await this._deleteWorkflow(workflowId);
        this.workflowSignal.dispatch(SignalEvent.REMOVE, config);
    }

    @exposed @info("Execute a workflow by ID with given inputs") @input(Sch.Name('workflowId', Sch.String), Sch.Name('inputs', WorkflowInputsSchema), Sch.Name('maxWaitSec', Sch.Optional(Sch.Number))) @output(WorkflowExecutionSchema)
    @wfApi
    public async executeWorkflow(workflowId: string, inputs: WorkflowInputs, maxWaitSec?: number): Promise<WorkflowExecution> { return this._executeWorkflow(workflowId, inputs, maxWaitSec); }

    @exposed @info("Execute an ad-hoc JavaScript script") @input(Sch.Name('script', Sch.String), Sch.Name('maxWaitSec', Sch.Optional(Sch.Number))) @output(WorkflowExecutionSchema)
    @wfApi
    public async executeScript(script: string, maxWaitSec?: number): Promise<WorkflowExecution> { return this._executeScript(script, maxWaitSec); }

    @exposed @info("Get execution details by ID") @input(Sch.Name('executionId', Sch.String)) @output(WorkflowExecutionSchema)
    @wfApi
    public async getWorkflowExecution(executionId: string): Promise<WorkflowExecution> { return this._getWorkflowExecution(executionId); }

    @exposed @info("Cancel a running workflow execution") @input(Sch.Name('executionId', Sch.String))
    @wfApi
    public async cancelWorkflowExecution(executionId: string): Promise<void> { return this._cancelWorkflowExecution(executionId); }

    @exposed @info("Create an automation trigger (schedule or signal)") @input(Sch.Name('data', WorkflowTriggerCreateRequestSchema)) @output(WorkflowTriggerSchema)
    @wfApi
    public async createTrigger(data: WorkflowTriggerCreateRequest): Promise<WorkflowTrigger> { return this._createTrigger(data); }

    @exposed @info("Update an existing trigger's configuration") @input(Sch.Name('data', WorkflowTriggerUpdatePayloadSchema)) @output(WorkflowTriggerSchema)
    @wfApi
    public async updateTrigger(data: WorkflowTriggerUpdatePayload): Promise<WorkflowTrigger> { return this._updateTrigger(data); }

    @exposed @info("Delete an automation trigger") @input(Sch.Name('triggerId', Sch.String))
    @wfApi
    public async deleteTrigger(triggerId: string): Promise<void> { return this._deleteTrigger(triggerId); }

    @exposed @info("List all automation triggers") @input(Sch.Name('params', Sch.Optional(ListTriggersParamsSchema))) @output(Sch.Array(WorkflowTriggerSchema))
    @wfApi
    public async listTriggers(params?: ListTriggersParams): Promise<WorkflowTrigger[]> { return this._listTriggers(params); }

    @exposed @info("Link a trigger to a workflow") @input(Sch.Name('workflowId', Sch.String), Sch.Name('triggerId', Sch.String))
    @wfApi
    public async linkTrigger(workflowId: string, triggerId: string): Promise<void> { return this._linkTrigger(workflowId, triggerId); }

    @exposed @info("Unlink a trigger from a workflow") @input(Sch.Name('workflowId', Sch.String), Sch.Name('triggerId', Sch.String))
    @wfApi
    public async unlinkTrigger(workflowId: string, triggerId: string): Promise<void> { return this._unlinkTrigger(workflowId, triggerId); }

    @exposed @info("List workflow execution history") @input(Sch.Name('params', Sch.Optional(ListWorkflowExecutionsParamsSchema))) @output(Sch.Array(WorkflowExecutionSchema))
    @wfApi
    public async listWorkflowExecutions(params?: ListWorkflowExecutionsParams): Promise<WorkflowExecution[]> { return this._listWorkflowExecutions(params); }

    @exposed @info("List all stored secret key names") @output(Sch.StringArray)
    public async listSecretKeys(): Promise<string[]> { return this._listSecretKeys(); }

    @exposed @info("Store an encrypted secret key-value pair") @input(Sch.Name('key', Sch.String), Sch.Name('value', Sch.String))
    public async setSecret(key: string, value: string): Promise<void> { return this._setSecret(key, value); }

    @exposed @info("Delete a stored secret") @input(Sch.Name('key', Sch.String))
    public async deleteSecret(key: string): Promise<void> { return this._deleteSecret(key); }

    // --- MCP Server ---

    @exposed @info("Start the MCP server")
    public async startMcpServer(): Promise<void> {
        await this._startMcpServer();
        const localSc = modules.getLocalServiceController();
        await localSc.app.setUserPreference(MCP_AUTO_START_PREF_KEY, true);
    }

    @exposed @info("Stop the MCP server")
    public async stopMcpServer(): Promise<void> {
        await this._stopMcpServer();
        const localSc = modules.getLocalServiceController();
        await localSc.app.setUserPreference(MCP_AUTO_START_PREF_KEY, false);
    }

    @exposed @info("Get MCP server status and connection info")
    @output(McpServerInfoSchema)
    public async getMcpServerInfo(): Promise<McpServerInfo> { return this._getMcpServerInfo(); }

    // --- Protected methods (override these in subclasses) ---

    protected async _isAvailable(): Promise<boolean> { return false; }
    protected async _listWorkflows(params?: ListWorkflowsParams): Promise<WorkflowConfig[]> { return []; }
    protected async _getWorkflowConfig(workflowId: string): Promise<WorkflowConfig> { throw new Error('Not implemented'); }
    protected async _createWorkflow(name: string, dir?: string): Promise<WorkflowConfig> { throw new Error('Not implemented'); }
    protected async _updateWorkflow(id: string, data: WorkflowSavePayload): Promise<WorkflowConfig> { throw new Error('Not implemented'); }
    protected async _deleteWorkflow(workflowId: string): Promise<void> { throw new Error('Not implemented'); }
    protected async _executeWorkflow(workflowId: string, inputs: WorkflowInputs, maxWaitSec?: number): Promise<WorkflowExecution> { throw new Error('Not implemented'); }
    protected async _executeScript(script: string, maxWaitSec?: number): Promise<WorkflowExecution> { throw new Error('Not implemented'); }
    protected async _getWorkflowExecution(executionId: string): Promise<WorkflowExecution> { throw new Error('Not implemented'); }
    protected async _cancelWorkflowExecution(executionId: string): Promise<void> { throw new Error('Not implemented'); }
    protected async _createTrigger(data: WorkflowTriggerCreateRequest): Promise<WorkflowTrigger> { throw new Error('Not implemented'); }
    protected async _updateTrigger(data: WorkflowTriggerUpdatePayload): Promise<WorkflowTrigger> { throw new Error('Not implemented'); }
    protected async _deleteTrigger(triggerId: string): Promise<void> { throw new Error('Not implemented'); }
    protected async _listTriggers(params?: ListTriggersParams): Promise<WorkflowTrigger[]> { return []; }
    protected async _linkTrigger(workflowId: string, triggerId: string): Promise<void> { throw new Error('Not implemented'); }
    protected async _unlinkTrigger(workflowId: string, triggerId: string): Promise<void> { throw new Error('Not implemented'); }
    protected async _listWorkflowExecutions(params?: ListWorkflowExecutionsParams): Promise<WorkflowExecution[]> { throw new Error('Not implemented'); }
    protected async _listSecretKeys(): Promise<string[]> { return []; }
    protected async _setSecret(key: string, value: string): Promise<void> { throw new Error('Not implemented'); }
    protected async _deleteSecret(key: string): Promise<void> { throw new Error('Not implemented'); }
    protected async _startMcpServer(): Promise<void> { throw new Error('Not supported.'); }
    protected async _stopMcpServer(): Promise<void> { throw new Error('Not supported.'); }
    protected async _getMcpServerInfo(): Promise<McpServerInfo> { return { isRunning: false, port: null, url: null }; }
}
