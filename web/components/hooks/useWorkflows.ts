import { useCallback, useRef, useState } from 'react';
import {
    WorkflowConfig, WorkflowSavePayload,
    WorkflowExecution, WorkflowInputs, WorkflowTrigger,
    WorkflowTriggerCreateRequest, WorkflowTriggerUpdatePayload,
    ListWorkflowExecutionsParams, McpServerInfo,
} from 'shared/types';
import ServiceController from 'shared/controller';
import { SignalNodeRef } from 'shared/signals';
import { useResource } from './useResource';
import { SignalEvent } from '@/lib/enums';
import { isServiceAvailable } from '@/lib/utils';

// ── useWorkflowsAvailable ────────────────────────────────────────────────────

export function useWorkflowsAvailable(deviceFingerprint: string | null) {
    const [available, setAvailable] = useState<boolean | null>(null);

    const load = useCallback(async (sc: ServiceController, shouldAbort: () => boolean) => {
        const result = await isServiceAvailable(sc, 'workflow.listWorkflows');
        if (shouldAbort()) return;
        setAvailable(result);
    }, []);

    const { isLoading } = useResource({ deviceFingerprint, load });

    return { available, isLoading };
}

// ── useWorkflows ────────────────────────────────────────────────────────────
// Lists all workflows + tracks running executions via signals.

export function useWorkflows(deviceFingerprint: string | null) {
    const [workflows, setWorkflows] = useState<WorkflowConfig[]>([]);
    const [runningExecutions, setRunningExecutions] = useState<Map<string, WorkflowExecution>>(new Map());
    const execStartRef = useRef<SignalNodeRef<[WorkflowExecution], string> | null>(null);
    const execEndRef = useRef<SignalNodeRef<[WorkflowExecution], string> | null>(null);
    const wfSignalRef = useRef<SignalNodeRef<[SignalEvent, WorkflowConfig], string> | null>(null);

    const load = useCallback(async (sc: ServiceController, shouldAbort: () => boolean) => {
        const list = await sc.workflow.listWorkflows();
        if (shouldAbort()) return;
        setWorkflows(list);
    }, []);

    const setupSignals = useCallback((sc: ServiceController) => {
        execStartRef.current = sc.workflow.executionStartSignal.add((exec: WorkflowExecution) => {
            if (!exec.workflowId) return;
            setRunningExecutions(prev => {
                const next = new Map(prev);
                next.set(exec.workflowId!, exec);
                return next;
            });
        });
        execEndRef.current = sc.workflow.executionEndSignal.add((exec: WorkflowExecution) => {
            if (!exec.workflowId) return;
            setRunningExecutions(prev => {
                const next = new Map(prev);
                next.delete(exec.workflowId!);
                return next;
            });
        });
        wfSignalRef.current = sc.workflow.workflowSignal.add((event: SignalEvent, config: WorkflowConfig) => {
            switch (event) {
                case SignalEvent.ADD:
                    setWorkflows(prev => [config, ...prev]);
                    break;
                case SignalEvent.UPDATE:
                    setWorkflows(prev => prev.map(w => w.id === config.id ? config : w));
                    break;
                case SignalEvent.REMOVE:
                    setWorkflows(prev => prev.filter(w => w.id !== config.id));
                    break;
            }
        });
    }, []);

    const clearSignals = useCallback((sc: ServiceController) => {
        if (execStartRef.current) { sc.workflow.executionStartSignal.detach(execStartRef.current); execStartRef.current = null; }
        if (execEndRef.current) { sc.workflow.executionEndSignal.detach(execEndRef.current); execEndRef.current = null; }
        if (wfSignalRef.current) { sc.workflow.workflowSignal.detach(wfSignalRef.current); wfSignalRef.current = null; }
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
    });

    return {
        workflows, runningExecutions, isLoading, error, reload,
    };
}

// ── useWorkflowDetail ───────────────────────────────────────────────────────
// Loads a single workflow config + its executions + triggers.

export function useWorkflowDetail(deviceFingerprint: string | null, workflowId: string | null) {
    const [config, setConfig] = useState<WorkflowConfig | null>(null);
    const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
    const [triggers, setTriggers] = useState<WorkflowTrigger[]>([]);
    const execStartRef = useRef<SignalNodeRef<[WorkflowExecution], string> | null>(null);
    const execEndRef = useRef<SignalNodeRef<[WorkflowExecution], string> | null>(null);
    const scRef = useRef<ServiceController | null>(null);

    const load = useCallback(async (sc: ServiceController, shouldAbort: () => boolean) => {
        scRef.current = sc;
        if (!workflowId) {
            setConfig(null);
            setExecutions([]);
            setTriggers([]);
            return;
        }
        const [cfg, execs, trigs] = await Promise.all([
            sc.workflow.getWorkflowConfig(workflowId),
            sc.workflow.listWorkflowExecutions({ workflowId, sortBy: 'startedAt', sortDirection: 'desc', limit: 20 }),
            sc.workflow.listTriggers({ workflowId }),
        ]);
        if (shouldAbort()) return;
        setConfig(cfg);
        setExecutions(execs);
        setTriggers(trigs);
    }, [workflowId]);

    const setupSignals = useCallback((sc: ServiceController) => {
        execStartRef.current = sc.workflow.executionStartSignal.add((exec: WorkflowExecution) => {
            if (exec.workflowId !== workflowId) return;
            setExecutions(prev => [exec, ...prev]);
        });
        execEndRef.current = sc.workflow.executionEndSignal.add((exec: WorkflowExecution) => {
            if (exec.workflowId !== workflowId) return;
            setExecutions(prev => prev.map(e => e.id === exec.id ? exec : e));
        });
    }, [workflowId]);

    const clearSignals = useCallback((sc: ServiceController) => {
        if (execStartRef.current) { sc.workflow.executionStartSignal.detach(execStartRef.current); execStartRef.current = null; }
        if (execEndRef.current) { sc.workflow.executionEndSignal.detach(execEndRef.current); execEndRef.current = null; }
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
        resourceKey: workflowId ?? undefined,
    });

    const updateWorkflow = useCallback(async (data: WorkflowSavePayload) => {
        const sc = scRef.current;
        if (!sc || !workflowId) throw new Error('Not initialized');
        const updated = await sc.workflow.updateWorkflow(workflowId, data);
        setConfig(updated);
        return updated;
    }, [workflowId]);

    const executeWorkflow = useCallback(async (inputs: WorkflowInputs = {}) => {
        const sc = scRef.current;
        if (!sc || !workflowId) throw new Error('Not initialized');
        return sc.workflow.executeWorkflow(workflowId, inputs);
    }, [workflowId]);

    const cancelExecution = useCallback(async (executionId: string) => {
        const sc = scRef.current;
        if (!sc) throw new Error('Not initialized');
        await sc.workflow.cancelWorkflowExecution(executionId);
    }, []);

    const linkTrigger = useCallback(async (triggerId: string) => {
        const sc = scRef.current;
        if (!sc || !workflowId) throw new Error('Not initialized');
        await sc.workflow.linkTrigger(workflowId, triggerId);
        const allTriggers = await sc.workflow.listTriggers({ workflowId });
        setTriggers(allTriggers);
    }, [workflowId]);

    const createTrigger = useCallback(async (data: WorkflowTriggerCreateRequest) => {
        const sc = scRef.current;
        if (!sc || !workflowId) throw new Error('Not initialized');
        const trigger = await sc.workflow.createTrigger(data);
        await sc.workflow.linkTrigger(workflowId, trigger.id);
        setTriggers(prev => [...prev, trigger]);
        return trigger;
    }, [workflowId]);

    const updateTrigger = useCallback(async (data: WorkflowTriggerUpdatePayload) => {
        const sc = scRef.current;
        if (!sc) throw new Error('Not initialized');
        const trigger = await sc.workflow.updateTrigger(data);
        setTriggers(prev => prev.map(t => t.id === trigger.id ? trigger : t));
        return trigger;
    }, []);

    const deleteTrigger = useCallback(async (triggerId: string) => {
        const sc = scRef.current;
        if (!sc || !workflowId) throw new Error('Not initialized');
        await sc.workflow.unlinkTrigger(workflowId, triggerId);
        await sc.workflow.deleteTrigger(triggerId);
        setTriggers(prev => prev.filter(t => t.id !== triggerId));
    }, [workflowId]);

    return {
        config, executions, triggers, isLoading, error, reload,
        updateWorkflow, executeWorkflow, cancelExecution,
        linkTrigger, createTrigger, updateTrigger, deleteTrigger,
    };
}

// ── useWorkflowExecutions ───────────────────────────────────────────────────
// Lists executions with optional filters.

export function useWorkflowExecutions(deviceFingerprint: string | null, params?: ListWorkflowExecutionsParams) {
    const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
    const execStartRef = useRef<SignalNodeRef<[WorkflowExecution], string> | null>(null);
    const execEndRef = useRef<SignalNodeRef<[WorkflowExecution], string> | null>(null);
    const scRef = useRef<ServiceController | null>(null);

    const load = useCallback(async (sc: ServiceController, shouldAbort: () => boolean) => {
        const list = await sc.workflow.listWorkflowExecutions(params);
        if (shouldAbort()) return;
        setExecutions(list);
        scRef.current = sc;
    }, [params]);

    const setupSignals = useCallback((sc: ServiceController) => {
        execStartRef.current = sc.workflow.executionStartSignal.add((exec: WorkflowExecution) => {
            setExecutions(prev => [exec, ...prev]);
        });
        execEndRef.current = sc.workflow.executionEndSignal.add((exec: WorkflowExecution) => {
            setExecutions(prev => prev.map(e => e.id === exec.id ? exec : e));
        });
    }, []);

    const clearSignals = useCallback((sc: ServiceController) => {
        if (execStartRef.current) { sc.workflow.executionStartSignal.detach(execStartRef.current); execStartRef.current = null; }
        if (execEndRef.current) { sc.workflow.executionEndSignal.detach(execEndRef.current); execEndRef.current = null; }
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
    });

    return { executions, isLoading, error, reload };
}

// ── useMcpServer ────────────────────────────────────────────────────────────
// MCP server lifecycle management.

export function useMcpServer(deviceFingerprint: string | null) {
    const [info, setInfo] = useState<McpServerInfo>({ isRunning: false, port: null, url: null });
    const scRef = useRef<ServiceController | null>(null);

    const load = useCallback(async (sc: ServiceController, shouldAbort: () => boolean) => {
        const mcpInfo = await sc.workflow.getMcpServerInfo();
        if (shouldAbort()) return;
        setInfo(mcpInfo);
        scRef.current = sc;
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
    });

    const startServer = useCallback(async () => {
        const sc = scRef.current;
        if (!sc) throw new Error('Not initialized');
        await sc.workflow.startMcpServer();
        const updated = await sc.workflow.getMcpServerInfo();
        setInfo(updated);
    }, []);

    const stopServer = useCallback(async () => {
        const sc = scRef.current;
        if (!sc) throw new Error('Not initialized');
        await sc.workflow.stopMcpServer();
        setInfo({ isRunning: false, port: null, url: null });
    }, []);

    return { info, isLoading, error, reload, startServer, stopServer };
}
