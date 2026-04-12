import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { WorkflowConfig, WorkflowSavePayload } from 'shared/types';
import { useWorkflowDetail } from '@/components/hooks/useWorkflows';
import { NewTriggerDialog } from './NewTriggerDialog';
import { Plus, X, Clock, Trash2 } from 'lucide-react';
import { WorkflowColor } from '@/lib/enums';
import { cn, cronToHuman, getServiceController } from '@/lib/utils';

const colorOptions: { value: WorkflowColor; bg: string }[] = [
    { value: WorkflowColor.Red, bg: 'bg-red-500' },
    { value: WorkflowColor.Green, bg: 'bg-green-500' },
    { value: WorkflowColor.Blue, bg: 'bg-blue-500' },
    { value: WorkflowColor.Yellow, bg: 'bg-yellow-500' },
    { value: WorkflowColor.Purple, bg: 'bg-purple-500' },
    { value: WorkflowColor.Cyan, bg: 'bg-cyan-500' },
];

export function EditWorkflowDialog({
    workflow,
    fingerprint,
    open,
    onClose,
}: {
    workflow: WorkflowConfig | null;
    fingerprint: string | null;
    open: boolean;
    onClose: () => void;
}) {
    const { triggers, createTrigger, deleteTrigger, linkTrigger } = useWorkflowDetail(fingerprint, open ? workflow?.id ?? null : null);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState<WorkflowColor>(WorkflowColor.Blue);
    const [isEnabled, setIsEnabled] = useState(true);
    const [scriptPath, setScriptPath] = useState('');
    const [maxExecTimeSecs, setMaxExecTimeSecs] = useState('');
    const [showNewTrigger, setShowNewTrigger] = useState(false);

    useEffect(() => {
        if (workflow && open) {
            setName(workflow.name);
            setDescription(workflow.description ?? '');
            setColor(workflow.color ?? WorkflowColor.Blue);
            setIsEnabled(workflow.isEnabled);
            setScriptPath(workflow.scriptPath);
            setMaxExecTimeSecs(workflow.maxExecTimeSecs?.toString() ?? '');
        }
    }, [workflow, open]);

    const handleSave = useCallback(async () => {
        if (!name.trim() || !workflow) return;
        try {
            const sc = await getServiceController(fingerprint);
            await sc.workflow.updateWorkflow(workflow.id, {
                name: name.trim(),
                description: description.trim() || undefined,
                color,
                isEnabled,
                scriptPath: scriptPath.trim() || undefined,
                maxExecTimeSecs: maxExecTimeSecs ? parseInt(maxExecTimeSecs) : undefined,
            });
            onClose();
        } catch (err: any) {
            console.error('Failed to save workflow:', err);
        }
    }, [name, description, color, isEnabled, scriptPath, maxExecTimeSecs, workflow, fingerprint, onClose]);

    const handleDelete = useCallback(async () => {
        if (!workflow) return;
        try {
            const sc = await getServiceController(fingerprint);
            await sc.workflow.deleteWorkflow(workflow.id);
            onClose();
        } catch (err: any) {
            console.error('Failed to delete workflow:', err);
        }
    }, [workflow, fingerprint, onClose]);

    return (
        <>
            <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
                <DialogContent className="sm:max-w-[28rem] max-h-[75vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Edit Workflow</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-2 overflow-y-auto flex-1">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="edit-wf-name">Name</Label>
                            <Input id="edit-wf-name" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="edit-wf-desc">Description</Label>
                            <Textarea id="edit-wf-desc" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
                        </div>
                        <div className="flex justify-between gap-1.5">
                            <Label>Enabled</Label>
                            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>Color</Label>
                            <div className="flex gap-2">
                                {colorOptions.map(c => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        className={cn(
                                            'w-7 h-7 rounded-full transition-all',
                                            c.bg,
                                            color === c.value
                                                ? 'ring-2 ring-offset-2 ring-offset-background ring-ring'
                                                : 'opacity-70 hover:opacity-100',
                                        )}
                                        onClick={() => setColor(c.value)}
                                        title={c.value}
                                    />
                                ))}
                            </div>
                        </div>


                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="edit-wf-script">Script Path</Label>
                            <Input
                                id="edit-wf-script"
                                value={scriptPath}
                                onChange={e => setScriptPath(e.target.value)}
                                className="text-xs"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="edit-wf-timeout">Max execution time (seconds)</Label>
                            <Input
                                id="edit-wf-timeout"
                                type="number"
                                value={maxExecTimeSecs}
                                onChange={e => setMaxExecTimeSecs(e.target.value)}
                                placeholder="300"
                            />
                        </div>

                        {/* Triggers */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                                <Label>Triggers</Label>
                                <Button variant="ghost" size="sm" onClick={() => setShowNewTrigger(true)}>
                                    <Plus size={14} className="mr-1" /> New
                                </Button>
                            </div>
                            {triggers.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                    {triggers.map(t => (
                                        <div key={t.id} className="flex items-center justify-between text-sm border rounded-md px-2 py-1.5">
                                            <span className="flex items-center gap-1.5 font-mono text-xs truncate">
                                                <Clock size={12} className="text-muted-foreground shrink-0" />
                                                {cronToHuman(t.data)}
                                            </span>
                                            <button
                                                className="text-muted-foreground hover:text-destructive ml-2 shrink-0"
                                                onClick={() => deleteTrigger(t.id)}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs text-muted-foreground">No triggers linked.</div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="destructive" size="platform" onClick={handleDelete} className="mr-auto">
                            Delete
                        </Button>
                        <Button variant="secondary" size="platform" onClick={onClose}>Cancel</Button>
                        <Button size="platform" onClick={handleSave} disabled={!name.trim()}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <NewTriggerDialog
                open={showNewTrigger}
                onClose={() => setShowNewTrigger(false)}
                onCreate={(type, data) => {
                    createTrigger({ type, data });
                    setShowNewTrigger(false);
                }}
            />
        </>
    );
}
