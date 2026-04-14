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
import { WorkflowConfig, WorkflowInputField, WorkflowSavePayload } from 'shared/types';
import { useWorkflowDetail } from '@/components/hooks/useWorkflows';
import { NewTriggerDialog } from './NewTriggerDialog';
import { Plus, X, Clock, Trash2, GripVertical } from 'lucide-react';
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

const inputFieldTypes = ['string', 'number', 'boolean', 'select'] as const;

function InputFieldRow({ field, onChange, onRemove }: {
    field: WorkflowInputField;
    onChange: (updated: WorkflowInputField) => void;
    onRemove: () => void;
}) {
    return (
        <div className="flex flex-col gap-2 border-b border-border/50 py-2.5">
            <div className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-1.5 text-xs text-muted-foreground">
                    Name:
                    <Input
                        value={field.name}
                        onChange={e => onChange({ ...field, name: e.target.value })}
                        placeholder="Field name"
                        className="flex-1 text-xs"
                    />
                </label>
                <Select value={field.type} onValueChange={v => onChange({ ...field, type: v as any, options: v === 'select' ? (field.options ?? ['']) : undefined })}>
                    <SelectTrigger className="w-[100px] text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {inputFieldTypes.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <button className="text-muted-foreground hover:text-destructive shrink-0" onClick={onRemove}>
                    <X size={14} />
                </button>
            </div>
            <div className="flex items-center justify-between gap-2">
                <label className="flex flex-1 items-center gap-1.5 text-xs text-muted-foreground">
                    Default:
                    {field.type === 'boolean' && (
                        <Select
                            value={field.defaultValue === true ? 'true' : field.defaultValue === false ? 'false' : 'unset'}
                            onValueChange={v => onChange({ ...field, defaultValue: v === 'unset' ? undefined : v === 'true' })}
                        >
                            <SelectTrigger className="flex-1 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="unset">Unset</SelectItem>
                                <SelectItem value="true">True</SelectItem>
                                <SelectItem value="false">False</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                    {field.type === 'select' && (
                        <Select
                            value={field.defaultValue !== undefined && field.defaultValue !== null ? String(field.defaultValue) : '__unset__'}
                            onValueChange={v => onChange({ ...field, defaultValue: v === '__unset__' ? undefined : v })}
                        >
                            <SelectTrigger className="flex-1 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__unset__">Unset</SelectItem>
                                {(field.options ?? []).filter(o => o.trim()).map(o => (
                                    <SelectItem key={o} value={o}>{o}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    {field.type !== 'boolean' && field.type !== 'select' && (
                        <Input
                            value={field.defaultValue?.toString() ?? ''}
                            onChange={e => onChange({ ...field, defaultValue: e.target.value || undefined })}
                            placeholder="Default value"
                            className="flex-1 text-xs"
                        />
                    )}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <Switch
                        checked={field.isRequired ?? false}
                        onCheckedChange={v => onChange({ ...field, isRequired: v })}
                    />
                    Required
                </label>
            </div>
            {field.type === 'select' && (
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Options (comma separated):</span>
                    <Input
                        value={(field.options ?? []).join(', ')}
                        onChange={e => onChange({ ...field, options: e.target.value.split(',').map(s => s.trim()) })}
                        className="text-xs"
                        placeholder="Option 1, Option 2, Option 3"
                    />
                </div>
            )}
        </div>
    );
}

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
    const [inputFields, setInputFields] = useState<WorkflowInputField[]>([]);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (workflow && open) {
            setName(workflow.name);
            setDescription(workflow.description ?? '');
            setColor(workflow.color ?? WorkflowColor.Blue);
            setIsEnabled(workflow.isEnabled);
            setScriptPath(workflow.scriptPath);
            setMaxExecTimeSecs(workflow.maxExecTimeSecs?.toString() ?? '');
            setInputFields(workflow.inputFields ?? []);
            setSaveError(null);
        }
    }, [workflow, open]);

    const handleSave = useCallback(async () => {
        if (!name.trim() || !workflow) return;
        setSaveError(null);
        try {
            const sc = await getServiceController(fingerprint);
            await sc.workflow.updateWorkflow(workflow.id, {
                name: name.trim(),
                description: description.trim() || undefined,
                color,
                isEnabled,
                scriptPath: scriptPath.trim() || undefined,
                inputFields: inputFields.filter(f => f.name.trim()),
                maxExecTimeSecs: maxExecTimeSecs ? parseInt(maxExecTimeSecs) : undefined,
            });
            onClose();
        } catch (err: any) {
            setSaveError(err.message || 'Failed to save workflow');
        }
    }, [name, description, color, isEnabled, scriptPath, inputFields, maxExecTimeSecs, workflow, fingerprint, onClose]);

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
                    <div className="flex flex-col gap-4 py-2 px-3 overflow-y-auto flex-1">
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
                            <Label>Max execution time</Label>
                            <Select value={maxExecTimeSecs || '300'} onValueChange={setMaxExecTimeSecs}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="30">30 seconds</SelectItem>
                                    <SelectItem value="60">1 minute</SelectItem>
                                    <SelectItem value="120">2 minutes</SelectItem>
                                    <SelectItem value="300">5 minutes (default)</SelectItem>
                                    <SelectItem value="600">10 minutes</SelectItem>
                                    <SelectItem value="1800">30 minutes</SelectItem>
                                    <SelectItem value="3600">1 hour</SelectItem>
                                    <SelectItem value="10800">3 hours</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Input Fields */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                                <Label>Input Fields</Label>
                                <Button variant="ghost" size="sm" onClick={() => setInputFields(prev => [...prev, { name: '', type: 'string' }])}>
                                    <Plus size={14} className="mr-1" /> Add
                                </Button>
                            </div>
                            {inputFields.length > 0 ? (
                                <div className="flex flex-col">
                                    {inputFields.map((field, i) => (
                                        <InputFieldRow
                                            key={i}
                                            field={field}
                                            onChange={(updated) => setInputFields(prev => prev.map((f, j) => j === i ? updated : f))}
                                            onRemove={() => setInputFields(prev => prev.filter((_, j) => j !== i))}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs text-muted-foreground">No input fields defined.</div>
                            )}
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
                                <div className="flex flex-col">
                                    {triggers.map(t => (
                                        <div key={t.id} className="flex items-center justify-between text-sm border-b border-border/50 px-2 py-2.5">
                                            <span className="flex items-center gap-1.5 text-xs truncate">
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
                    {saveError && (
                        <p className="text-sm text-destructive px-2 pb-1">{saveError}</p>
                    )}
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
