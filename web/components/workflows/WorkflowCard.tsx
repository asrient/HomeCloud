import { cn, getLocalServiceController, getServiceController } from '@/lib/utils';
import { WorkflowColor, WorkflowConfig, WorkflowExecution } from 'shared/types';
import { Play } from 'lucide-react';
import LoadingIcon from '@/components/ui/loadingIcon';
import { useCallback } from 'react';
import { ContextMenuArea } from '@/components/contextMenuArea';
import { ContextMenuItem } from '@/lib/types';

const colorMap: Record<WorkflowColor, string> = {
    red: 'bg-red-500',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    cyan: 'bg-cyan-500',
};

const defaultColor = 'bg-sky-500';

export function WorkflowCard({
    workflow,
    fingerprint,
    isRunning,
    onClick,
    onEdit,
    onDelete,
}: {
    workflow: WorkflowConfig;
    fingerprint: string | null;
    isRunning?: boolean;
    onClick?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
}) {
    const bg = workflow.color ? colorMap[workflow.color] : defaultColor;

    const handlePlay = useCallback(async (e?: React.MouseEvent) => {
        e?.stopPropagation();
        try {
            const sc = await getServiceController(fingerprint);
            await sc.workflow.executeWorkflow(workflow.id, {});
        } catch (err: any) {
            console.error('Failed to execute workflow:', err);
        }
    }, [fingerprint, workflow.id]);

    const handleOpenScript = useCallback(async () => {
        try {
            const sc = getLocalServiceController();
            await sc.system.openFile(workflow.scriptPath);
        } catch (err: any) {
            console.error('Failed to open script:', err);
        }
    }, [workflow.scriptPath]);

    const menuItems = useCallback((): ContextMenuItem[] => [
        { id: 'run', label: 'Run now' },
        { id: 'edit', label: 'Edit workflow' },
        { id: 'script', label: 'View script' },
        { id: 'sep', type: 'separator' },
        { id: 'delete', label: 'Delete' },
    ], []);

    const handleMenuClick = useCallback((id: string) => {
        console.log('[WorkflowCard] menu click:', id);
        switch (id) {
            case 'run': handlePlay(); break;
            case 'edit': onEdit?.(); break;
            case 'script': handleOpenScript(); break;
            case 'delete': onDelete?.(); break;
        }
    }, [handlePlay, onEdit, handleOpenScript, onDelete]);

    return (
        <ContextMenuArea onMenuOpen={menuItems} onMenuItemClick={handleMenuClick}>
        <div
            className={cn(
                'group relative rounded-3xl p-4 cursor-default select-none',
                'flex flex-col justify-between h-[6.5rem] min-w-0',
                'transition-all duration-150',
                bg,
                'hover:brightness-110 active:scale-[0.97]',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
            onClick={onClick}
        >
            {/* Top row: status / play */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    {isRunning && (
                        <div className="flex items-center gap-1 text-white/90 text-xs font-medium">
                            <LoadingIcon size="sm" className="text-white/90" />
                            <span>Running</span>
                        </div>
                    )}
                </div>
                {/* Play button — visible on hover */}
                <button
                    className={cn(
                        'rounded-full p-1.5 bg-white/20 text-white',
                        'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
                        'hover:bg-white/30 active:bg-white/40',
                    )}
                    onClick={handlePlay}
                    title="Run workflow"
                >
                    <Play size={14} fill="currentColor" />
                </button>
            </div>

            {/* Bottom: name + description */}
            <div className="min-w-0">
                <div className="text-white font-semibold text-sm leading-tight truncate">
                    {workflow.name}
                </div>
                {workflow.description && (
                    <div className="text-white/70 text-xs mt-0.5 truncate">
                        {workflow.description}
                    </div>
                )}
            </div>
        </div>
        </ContextMenuArea>
    );
}
