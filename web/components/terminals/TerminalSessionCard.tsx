import { cn, isWin11Theme } from '@/lib/utils';
import { TerminalSessionEntry } from 'shared/types';
import { ContextMenuArea } from '@/components/contextMenuArea';
import { ContextMenuItem } from '@/lib/types';
import { useCallback } from 'react';
import { Terminal } from 'lucide-react';

export function TerminalSessionCard({
    session,
    onClick,
    onKill,
}: {
    session: TerminalSessionEntry;
    onClick?: () => void;
    onKill?: () => void;
}) {
    const menuItems = useCallback((): ContextMenuItem[] => [
        { id: 'attach', label: 'Open' },
        { id: 'sep', type: 'separator' },
        { id: 'kill', label: 'Kill session' },
    ], []);

    const handleMenuClick = useCallback((id: string) => {
        switch (id) {
            case 'attach': onClick?.(); break;
            case 'kill': onKill?.(); break;
        }
    }, [onClick, onKill]);

    return (
        <ContextMenuArea onMenuOpen={menuItems} onMenuItemClick={handleMenuClick}>
            <div
                className={cn(
                    'group relative p-4 cursor-default select-none',
                    'flex flex-col justify-between h-[6rem] min-w-0',
                    'transition-all duration-150',
                    'dark:bg-zinc-900 bg-zinc-700',
                    isWin11Theme() ? 'border-t-[3px] border-primary/90' : 'rounded-2xl',
                    'hover:brightness-110 active:scale-[0.97]',
                )}
                onClick={onClick}
            >
                <div className="flex items-center gap-1.5">
                    <Terminal size={14} className="text-white/70" />
                    <span className="text-white/50 text-xs">{session.pid}</span>
                </div>

                <div className="min-w-0">
                    <div className={cn(
                        "text-white text-sm leading-tight truncate",
                        isWin11Theme() ? 'font-normal' : 'font-semibold'
                    )}>
                        {session.processName}
                    </div>
                    <div className="text-white/60 text-xs mt-0.5 truncate">
                        {session.shell}
                    </div>
                </div>
            </div>
        </ContextMenuArea>
    );
}
