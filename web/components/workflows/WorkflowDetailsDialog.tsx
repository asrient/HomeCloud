import { useCallback } from 'react';
import { WorkflowConfig, WorkflowExecution, WorkflowTrigger } from 'shared/types';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { WorkflowColor } from 'shared/types';
import { Play, Pencil, Clock, LucideIcon, SquareFunction } from 'lucide-react';
import { cn, cronToHuman, getLocalServiceController } from '@/lib/utils';
import { ExecutionList } from './ExecutionList';

const colorMap: Record<WorkflowColor, string> = {
    red: 'bg-red-500',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    cyan: 'bg-cyan-500',
};

const defaultColor = 'bg-sky-500';

function GlassButton({ icon: Icon, label, onClick, fillIcon }: { icon: LucideIcon; label: string; onClick: () => void; fillIcon?: boolean }) {
    return (
        <Button
            size="sm"
            variant="secondary"
            className="bg-white/20 hover:bg-white/30 text-white border-0"
            onClick={onClick}
        >
            <Icon size={14} fill={fillIcon ? 'currentColor' : 'none'} className="mr-1" /> {label}
        </Button>
    );
}

export function WorkflowDetailsDialog({
    workflow,
    fingerprint,
    executions,
    triggers,
    isRunning,
    open,
    onClose,
    onRun,
    onEdit,
}: {
    workflow: WorkflowConfig | null;
    fingerprint: string | null;
    executions: WorkflowExecution[];
    triggers: WorkflowTrigger[];
    isRunning?: boolean;
    open: boolean;
    onClose: () => void;
    onRun: () => void;
    onEdit: () => void;
}) {
    const handleOpenScript = useCallback(async () => {
        if (!workflow) return;
        try {
            const sc = getLocalServiceController();
            await sc.system.openFile(workflow.scriptPath);
        } catch (err: any) {
            console.error('Failed to open script:', err);
        }
    }, [workflow]);

    if (!workflow) return null;

    const bg = workflow.color ? colorMap[workflow.color] : defaultColor;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-[32rem] h-[35rem] max-h-[75vh] p-0 overflow-hidden gap-0 flex flex-col">
                {/* Header with color bg */}
                <div className={cn('px-5 pt-5 pb-4 text-white', bg)}>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold leading-tight truncate">{workflow.name}</h2>
                        {workflow.description && (
                            <p className="text-white/70 text-sm mt-0.5 line-clamp-2">{workflow.description}</p>
                        )}
                    </div>
                    {triggers.length > 0 && (
                        <p className="text-white/80 text-xs mt-2 flex items-center gap-1">
                            <Clock size={12} />
                            {triggers.map(t => cronToHuman(t.data)).join(', ')}
                        </p>
                    )}
                    <div className="flex gap-2 mt-3 py-3">
                        <GlassButton icon={Play} label="Run" onClick={onRun} fillIcon />
                        <GlassButton icon={Pencil} label="Edit" onClick={onEdit} />
                        <GlassButton icon={SquareFunction} label="Script" onClick={handleOpenScript} />
                    </div>
                </div>

                {/* Body */}
                <div className="flex flex-col min-h-0 flex-1">

                    {/* Execution history */}
                    <div className="overflow-y-auto">
                        <h3 className="text-xs font-medium text-muted-foreground tracking-wide py-4 px-5 sticky top-0 bg-popover z-10">Recent Runs</h3>
                        <ExecutionList executions={executions} />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
