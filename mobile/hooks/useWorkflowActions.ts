import { useCallback, useState } from 'react';
import { WorkflowConfig, WorkflowInputs } from 'shared/types';
import { getLocalServiceController, getServiceController } from '@/lib/utils';
import { useManagedLoading } from './useManagedLoading';

export function useWorkflowActions(deviceFingerprint: string | null) {
    const { withLoading } = useManagedLoading();
    const [runWorkflow, setRunWorkflow] = useState<WorkflowConfig | null>(null);

    const executeWithInputs = useCallback(async (wf: WorkflowConfig, inputs: WorkflowInputs) => {
        try {
            const sc = await getServiceController(deviceFingerprint);
            sc.workflow.executeWorkflow(wf.id, inputs);
        } catch (err: any) {
            console.error('Failed to run workflow:', err);
        }
    }, [deviceFingerprint]);

    const handleRun = useCallback((wf: WorkflowConfig) => {
        if (wf.inputFields && wf.inputFields.length > 0) {
            setRunWorkflow(wf);
        } else {
            executeWithInputs(wf, {});
        }
    }, [executeWithInputs]);

    const handleViewScript = useCallback(async (wf: WorkflowConfig) => {
        await withLoading(async () => {
            const localSc = getLocalServiceController();
            await localSc.files.openFile(deviceFingerprint, wf.scriptPath);
        }, { title: 'Opening script…', errorTitle: 'Could not open script', delay: 0 });
    }, [deviceFingerprint, withLoading]);

    const dismissRunModal = useCallback(() => setRunWorkflow(null), []);

    const onRunModalSubmit = useCallback((inputs: WorkflowInputs) => {
        if (runWorkflow) executeWithInputs(runWorkflow, inputs);
    }, [runWorkflow, executeWithInputs]);

    return {
        runWorkflow,
        handleRun,
        handleViewScript,
        executeWithInputs,
        runModalProps: {
            workflow: runWorkflow,
            visible: runWorkflow !== null,
            onClose: dismissRunModal,
            onRun: onRunModalSubmit,
        },
    };
}
