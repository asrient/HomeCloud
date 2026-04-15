import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
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

const CUSTOM = '__custom__';

const scheduleOptions: { label: string; value: string }[] = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Every 5 minutes', value: '*/5 * * * *' },
    { label: 'Every 15 minutes', value: '*/15 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every day at midnight', value: '0 0 * * *' },
    { label: 'Every day at 9 AM', value: '0 9 * * *' },
    { label: 'Every Monday at 9 AM', value: '0 9 * * 1' },
    { label: 'Every 1st of month', value: '0 0 1 * *' },
    { label: 'Custom', value: CUSTOM },
];

export function NewTriggerDialog({ open, onClose, onCreate }: {
    open: boolean;
    onClose: () => void;
    onCreate: (type: 'schedule' | 'signal', data: string) => void;
}) {
    const [selected, setSelected] = useState('');
    const [customCron, setCustomCron] = useState('');

    const isCustom = selected === CUSTOM;
    const resolvedCron = isCustom ? customCron.trim() : selected;

    const reset = useCallback(() => {
        setSelected('');
        setCustomCron('');
    }, []);

    const handleCreate = useCallback(() => {
        if (!resolvedCron) return;
        onCreate('schedule', resolvedCron);
        reset();
    }, [resolvedCron, onCreate, reset]);

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
            <DialogContent className="sm:max-w-[24rem]">
                <DialogHeader>
                    <DialogTitle>New Schedule Trigger</DialogTitle>
                    <DialogDescription>
                        Set a schedule to run this workflow automatically.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3 py-2">
                    <div className="flex flex-col gap-1.5">
                        <Label>Schedule</Label>
                        <Select value={selected} onValueChange={setSelected}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose a schedule..." />
                            </SelectTrigger>
                            <SelectContent>
                                {scheduleOptions.map(o => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {isCustom && (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="trigger-cron">Cron Expression</Label>
                            <Input
                                id="trigger-cron"
                                value={customCron}
                                onChange={e => setCustomCron(e.target.value)}
                                placeholder="*/5 * * * *"
                                className="font-mono"
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                            />
                            <p className="text-xs text-muted-foreground">
                                Format: minute hour day month weekday
                            </p>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="platform" onClick={() => { onClose(); reset(); }}>
                        Cancel
                    </Button>
                    <Button size="platform" onClick={handleCreate} disabled={!resolvedCron}>
                        Create
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
