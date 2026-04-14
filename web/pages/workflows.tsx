import { PageBar, PageContent, PagePlaceholder, MenuButton, MenuGroup } from "@/components/pagePrimatives";
import { buildPageConfig, getServiceController } from '@/lib/utils'
import Head from 'next/head'
import { useState, useCallback, useMemo } from 'react'
import { ThemedIconName } from "@/lib/enums";
import { useAppState } from "@/components/hooks/useAppState";
import { useWorkflows, useWorkflowDetail, useWorkflowsAvailable } from "@/components/hooks/useWorkflows";
import { WorkflowCard } from "@/components/workflows/WorkflowCard";
import { WorkflowDetailsDialog } from "@/components/workflows/WorkflowDetailsDialog";
import { EditWorkflowDialog } from "@/components/workflows/EditWorkflowDialog";
import { NewWorkflowDialog } from "@/components/workflows/NewWorkflowDialog";
import { RunWorkflowDialog } from "@/components/workflows/RunWorkflowDialog";
import ConfirmModal from "@/components/confirmModal";
import { WorkflowConfig } from "shared/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function Page() {
    const { selectedFingerprint } = useAppState();
    const { available: workflowsAvailable, isLoading: availLoading } = useWorkflowsAvailable(selectedFingerprint);
    const { workflows, runningExecutions, isLoading } = useWorkflows(selectedFingerprint);

    const [detailWorkflowId, setDetailWorkflowId] = useState<string | null>(null);
    const [editWorkflowId, setEditWorkflowId] = useState<string | null>(null);
    const [deleteWorkflow, setDeleteWorkflow] = useState<WorkflowConfig | null>(null);
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [runWorkflow, setRunWorkflow] = useState<WorkflowConfig | null>(null);
    const [showGuide, setShowGuide] = useState(false);
    const [guideMarkdown, setGuideMarkdown] = useState<string | null>(null);

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

    const handleOpenGuide = useCallback(async () => {
        setShowGuide(true);
        if (!guideMarkdown) {
            try {
                const sc = await getServiceController(selectedFingerprint);
                const md = await sc.workflow.getScriptingGuide();
                setGuideMarkdown(md);
            } catch (err: any) {
                console.error('Failed to load scripting guide:', err);
                setGuideMarkdown('Failed to load scripting guide.');
            }
        }
    }, [selectedFingerprint, guideMarkdown]);

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
                    <MenuButton title="Scripting Guide" onClick={handleOpenGuide}>
                        <BookOpen size={16} />
                    </MenuButton>
                    <MenuButton title="New Workflow" onClick={() => setShowNewDialog(true)}>
                        <Plus size={16} />
                    </MenuButton>
                </MenuGroup>
            </PageBar>
            <PageContent>
                {!availLoading && !workflowsAvailable ? (
                    <PagePlaceholder title="Workflows not available" detail="This device does not support workflows." />
                ) : workflows.length === 0 && !isLoading ? (
                    <PagePlaceholder title="No workflows yet" detail="Create a workflow to automate tasks on this device." />
                ) : (
                <ScrollArea className="h-full">
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
                </ScrollArea>
                )}

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
                <Dialog open={showGuide} onOpenChange={setShowGuide}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Scripting Guide</DialogTitle>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto min-h-0">
                            <div className="prose prose-sm dark:prose-invert max-w-none pr-4 select-text">
                                {guideMarkdown ? (
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} breaks>{guideMarkdown}</ReactMarkdown>
                                ) : (
                                    <p className="text-muted-foreground">Loading...</p>
                                )}
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
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
