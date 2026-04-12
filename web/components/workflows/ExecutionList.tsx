import { useState, useCallback } from 'react';
import { WorkflowExecution } from 'shared/types';
import { CheckCircle2, XCircle, Timer, Ban, FileText, ChevronDown } from 'lucide-react';
import { cn, getLocalServiceController } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import LoadingIcon from '@/components/ui/loadingIcon';

function StatusIcon({ status }: { status?: string }) {
    switch (status) {
        case 'ok': return <CheckCircle2 size={14} className="text-muted-foreground" />;
        case 'error': return <XCircle size={14} className="text-red-400" />;
        case 'timeout': return <Timer size={14} className="text-yellow-400" />;
        case 'cancelled': return <Ban size={14} className="text-yellow-400" />;
        default: return <LoadingIcon size="sm" />;
    }
}

function statusLabel(status?: string): string {
    switch (status) {
        case 'ok': return 'Completed';
        case 'error': return 'Failed';
        case 'timeout': return 'Timed out';
        case 'cancelled': return 'Cancelled';
        default: return 'Running';
    }
}

function formatDate(d: Date | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function formatDuration(start: Date, end?: Date): string {
    if (!end) return 'running...';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}m ${remainSecs}s`;
}

function ExecutionRow({ exec }: { exec: WorkflowExecution }) {
    const [expanded, setExpanded] = useState(false);

    const handleOpenLog = useCallback(async () => {
        if (!exec.logFilePath) return;
        try {
            const sc = getLocalServiceController();
            await sc.system.openFile(exec.logFilePath);
        } catch (err: any) {
            console.error('Failed to open log:', err);
        }
    }, [exec.logFilePath]);

    return (
        <div className="border-b border-border/30 last:border-b-0">
            <button
                className="w-full flex items-center gap-2 text-xs py-2 px-5 hover:bg-muted/50 text-left"
                onClick={() => setExpanded(prev => !prev)}
            >
                <StatusIcon status={exec.result?.status} />
                <span className="flex-1 truncate">
                    {exec.result?.message || statusLabel(exec.result?.status)}
                </span>
                <span className="text-muted-foreground shrink-0">{formatDate(exec.startedAt)}</span>
                <ChevronDown size={12} className={cn(
                    'text-muted-foreground transition-transform shrink-0',
                    expanded && 'rotate-180',
                )} />
            </button>
            {expanded && (
                <div className="px-5 pb-3 pt-1 text-xs space-y-1.5">
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
                        <span>Status</span>
                        <span className="text-foreground">{statusLabel(exec.result?.status)}</span>
                        <span>Started</span>
                        <span className="text-foreground">{formatDate(exec.startedAt)}</span>
                        {exec.endedAt && (
                            <>
                                <span>Ended</span>
                                <span className="text-foreground">{formatDate(exec.endedAt)}</span>
                            </>
                        )}
                        <span>Duration</span>
                        <span className="text-foreground">{formatDuration(exec.startedAt, exec.endedAt)}</span>
                        {exec.result?.message && (
                            <>
                                <span>Message</span>
                                <span className="text-foreground break-words overflow-hidden select-text">{exec.result.message}</span>
                            </>
                        )}
                    </div>
                    {exec.logFilePath && (
                        <Button variant="default" size="sm" className="text-xs h-7 px-2" onClick={handleOpenLog}>
                            <FileText size={12} className="mr-1" /> Logs
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}

export function ExecutionList({ executions }: { executions: WorkflowExecution[] }) {
    if (executions.length === 0) {
        return <p className="text-xs text-muted-foreground text-center py-4">No runs yet.</p>;
    }

    return (
        <div className="flex flex-col">
            {executions.map(exec => (
                <ExecutionRow key={exec.id} exec={exec} />
            ))}
        </div>
    );
}
