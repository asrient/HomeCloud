import { PageBar, PageContent, MenuButton, MenuGroup } from "@/components/pagePrimatives";
import { buildPageConfig, getServiceController } from '@/lib/utils'
import Head from 'next/head'
import { useState, useCallback, useMemo } from 'react'
import { ThemedIconName } from "@/lib/enums";
import { useAppState } from "@/components/hooks/useAppState";
import { useWorkflows, useWorkflowDetail } from "@/components/hooks/useWorkflows";
import { WorkflowCard } from "@/components/workflows/WorkflowCard";
import { WorkflowDetailsDialog } from "@/components/workflows/WorkflowDetailsDialog";
import { EditWorkflowDialog } from "@/components/workflows/EditWorkflowDialog";
import { NewWorkflowDialog } from "@/components/workflows/NewWorkflowDialog";
import { RunWorkflowDialog } from "@/components/workflows/RunWorkflowDialog";
import ConfirmModal from "@/components/confirmModal";
import { WorkflowConfig } from "shared/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus } from 'lucide-react';

function Page() {
    const { selectedFingerprint } = useAppState();
    const { workflows, runningExecutions, isLoading } = useWorkflows(selectedFingerprint);

    const [detailWorkflowId, setDetailWorkflowId] = useState<string | null>(null);
    const [editWorkflowId, setEditWorkflowId] = useState<string | null>(null);
    const [deleteWorkflow, setDeleteWorkflow] = useState<WorkflowConfig | null>(null);
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [runWorkflow, setRunWorkflow] = useState<WorkflowConfig | null>(null);

    const detailWorkflow = useMemo(
        () => workflows.find(w => w.id === detailWorkflowId) ?? null,
        [workflows, detailWorkflowId],
    );
    const editWorkflow = useMemo(
        () => workflows.find(w => w.id === editWorkflowId) ?? null,
        [workflows, editWorkflowId],
    );

    const { executions, triggers } = useWorkflowDetail(selectedFingerprint, detailWorkflowId);

    const handleRun = useCallback(async (wf: WorkflowConfig) => {
        if (wf.inputFields && wf.inputFields.length > 0) {
            setRunWorkflow(wf);
        } else {
            try {
                const sc = await getServiceController(selectedFingerprint);
                await sc.workflow.executeWorkflow(wf.id, {});
            } catch (err: any) {
                console.error('Failed to execute workflow:', err);
            }
        }
    }, [selectedFingerprint]);

    const handleCreate = useCallback(async (name: string, dir?: string) => {
        try {
            const sc = await getServiceController(selectedFingerprint);
            await sc.workflow.createWorkflow(name, dir);
            setShowNewDialog(false);
        } catch (err: any) {
            console.error('Failed to create workflow:', err);
        }
    }, [selectedFingerprint]);

    return (
        <>
            <Head>
                <title>Workflows</title>
            </Head>

            <PageBar icon={ThemedIconName.Workflows} title="Workflows">
                <MenuGroup>
                    <MenuButton title="New Workflow" onClick={() => setShowNewDialog(true)}>
                        <Plus size={16} />
                    </MenuButton>
                </MenuGroup>
            </PageBar>
            <PageContent>
                <ScrollArea className="h-full">
                    {workflows.length === 0 && !isLoading ? (
                        <div className="p-4 text-sm text-muted-foreground">
                            No workflows yet.
                        </div>
                    ) : (
                        <div className="p-4 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                            {workflows.map(wf => (
                                <WorkflowCard
                                    key={wf.id}
                                    workflow={wf}
                                    fingerprint={selectedFingerprint}
                                    isRunning={runningExecutions.has(wf.id)}
                                    onClick={() => setDetailWorkflowId(wf.id)}
                                    onRun={() => handleRun(wf)}
                                    onEdit={() => setEditWorkflowId(wf.id)}
                                    onDelete={() => setDeleteWorkflow(wf)}
                                />
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <WorkflowDetailsDialog
                    workflow={detailWorkflow}
                    fingerprint={selectedFingerprint}
                    executions={executions}
                    triggers={triggers}
                    isRunning={detailWorkflowId ? runningExecutions.has(detailWorkflowId) : false}
                    open={detailWorkflow !== null}
                    onClose={() => setDetailWorkflowId(null)}
                    onRun={() => { if (detailWorkflow) handleRun(detailWorkflow); }}
                    onEdit={() => {
                        if (!detailWorkflowId) return;
                        setDetailWorkflowId(null);
                        setEditWorkflowId(detailWorkflowId);
                    }}
                />
                <EditWorkflowDialog
                    workflow={editWorkflow}
                    fingerprint={selectedFingerprint}
                    open={editWorkflow !== null}
                    onClose={() => setEditWorkflowId(null)}
                />
                <NewWorkflowDialog
                    open={showNewDialog}
                    onClose={() => setShowNewDialog(false)}
                    onCreate={handleCreate}
                    fingerprint={selectedFingerprint}
                />
                <RunWorkflowDialog
                    workflow={runWorkflow}
                    fingerprint={selectedFingerprint}
                    open={runWorkflow !== null}
                    onClose={() => setRunWorkflow(null)}
                />
                <ConfirmModal
                    title={`Delete "${deleteWorkflow?.name}"?`}
                    description="The script file will not be deleted."
                    buttonText="Delete"
                    buttonVariant="destructive"
                    isOpen={deleteWorkflow !== null}
                    onOpenChange={(open) => { if (!open) setDeleteWorkflow(null); }}
                    onConfirm={async () => {
                        if (!deleteWorkflow) return;
                        const sc = await getServiceController(selectedFingerprint);
                        await sc.workflow.deleteWorkflow(deleteWorkflow.id);
                        setDeleteWorkflow(null);
                    }}
                />
            </PageContent>
        </>
    )
}

Page.config = buildPageConfig()
export default Page
