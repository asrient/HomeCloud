import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { WorkflowConfig, WorkflowInputField, WorkflowInputs } from 'shared/types';
import { getServiceController } from '@/lib/utils';

function buildDefaults(fields: WorkflowInputField[]): WorkflowInputs {
    const inputs: WorkflowInputs = {};
    for (const f of fields) {
        if (f.defaultValue !== undefined && f.defaultValue !== null) {
            inputs[f.name] = f.defaultValue;
        } else if (f.type === 'boolean') {
            inputs[f.name] = false;
        }
    }
    return inputs;
}

export function RunWorkflowDialog({
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
    const [inputs, setInputs] = useState<WorkflowInputs>({});
    const [running, setRunning] = useState(false);

    useEffect(() => {
        if (workflow && open) {
            setInputs(buildDefaults(workflow.inputFields ?? []));
        }
    }, [workflow, open]);

    const setValue = useCallback((name: string, value: string | number | boolean) => {
        setInputs(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleRun = useCallback(async () => {
        if (!workflow) return;
        setRunning(true);
        try {
            const sc = await getServiceController(fingerprint);
            await sc.workflow.executeWorkflow(workflow.id, inputs);
            onClose();
        } catch (err: any) {
            console.error('Failed to execute workflow:', err);
        } finally {
            setRunning(false);
        }
    }, [workflow, fingerprint, inputs, onClose]);

    if (!workflow) return null;
    const fields = workflow.inputFields ?? [];

    const canRun = fields.every(f => {
        if (!f.isRequired) return true;
        const v = inputs[f.name];
        return v !== undefined && v !== null && v !== '';
    });

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-[26rem]">
                <DialogHeader>
                    <DialogTitle>Run {workflow.name}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3 p-3 max-h-[50vh] overflow-y-auto">
                    {fields.map((field) => (
                        <div key={field.name} className="flex flex-col gap-1.5">
                            <Label>
                                {field.name}
                                {field.isRequired && <span className="text-destructive ml-0.5">*</span>}
                            </Label>
                            {field.type === 'boolean' ? (
                                <Select
                                    value={String(inputs[field.name] ?? 'false')}
                                    onValueChange={v => setValue(field.name, v === 'true')}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="true">True</SelectItem>
                                        <SelectItem value="false">False</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : field.type === 'select' && field.options ? (
                                <Select
                                    value={String(inputs[field.name] ?? '')}
                                    onValueChange={v => setValue(field.name, v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {field.options.filter(o => o.trim()).map(o => (
                                            <SelectItem key={o} value={o}>{o}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    type={field.type === 'number' ? 'number' : 'text'}
                                    value={String(inputs[field.name] ?? '')}
                                    onChange={e => setValue(field.name, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                                    placeholder={field.defaultValue !== undefined ? String(field.defaultValue) : undefined}
                                />
                            )}
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <Button variant="secondary" size="platform" onClick={onClose}>Cancel</Button>
                    <Button size="platform" onClick={handleRun} disabled={running || !canRun}>
                        {running ? 'Running…' : 'Run'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
