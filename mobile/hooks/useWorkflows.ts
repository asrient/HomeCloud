import { useCallback, useRef, useState } from 'react';
import {
    WorkflowConfig, WorkflowExecution, WorkflowTrigger,
    ListWorkflowExecutionsParams,
} from 'shared/types';
import ServiceController from 'shared/controller';
import { SignalNodeRef } from 'shared/signals';
import { useResource } from './useResource';
import { SignalEvent } from '@/lib/types';

// ── useWorkflows ──────────────────────────────────────────────────────────────
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

// ── useWorkflowDetail ─────────────────────────────────────────────────────────
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

    const executeWorkflow = useCallback(async (inputs: Record<string, any> = {}) => {
        const sc = scRef.current;
        if (!sc || !workflowId) throw new Error('Not initialized');
        return sc.workflow.executeWorkflow(workflowId, inputs);
    }, [workflowId]);

    return {
        config, executions, triggers, isLoading, error, reload,
        executeWorkflow,
    };
}
