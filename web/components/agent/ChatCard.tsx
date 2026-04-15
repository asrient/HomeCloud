import { cn, formatDate } from '@/lib/utils';
import { ChatInfo, ChatStatus } from 'shared/types';

const statusColors: Record<ChatStatus, string> = {
    idle: 'border-l-gray-500/40',
    working: 'border-l-blue-500/50',
    asking: 'border-l-amber-500/50',
    error: 'border-l-red-500/50',
};

function getStatusColor(chat: ChatInfo): string {
    if (chat.isUnread && chat.status === 'idle') {
        return 'border-l-green-500/50';
    }
    return statusColors[chat.status] || statusColors['idle'];
}

function chatStatusLabel(chat: ChatInfo): { text: string; dot?: string } | null {
    if (chat.isUnread) return { text: 'New messages', dot: 'bg-blue-500' };
    switch (chat.status) {
        case 'working': return { text: 'Working...' };
        case 'asking': return { text: 'Needs permission', dot: 'bg-amber-500' };
        case 'error': return { text: 'Error', dot: 'bg-red-500' };
        default: return null;
    }
}

export function ChatCard({ chat, onClick }: {
    chat: ChatInfo;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex flex-col w-full text-left rounded-[4px] border-border/40 border-l-[4px]',
                'px-2 py-4 hover:bg-secondary transition-colors bg-secondary/30',
                getStatusColor(chat),
            )}>
            <div className={cn(
                "flex items-center gap-1.5 text-sm truncate text-foreground/90 font-normal",
            )}>
                {chat.title || 'Untitled chat'}
            </div>
            <div className="text-xs text-muted-foreground mt-1 gap-x-2 flex justify-between">
                <div>
                    {(() => {
                        const label = chatStatusLabel(chat);
                        if (!label) return null;
                        return (
                            <span className="inline-flex items-center gap-1">
                                {label.dot && <span className={cn('w-1.5 h-1.5 rounded-full', label.dot)} />}
                                {label.text}
                            </span>
                        );
                    })()}
                </div>
                <div>{formatDate(chat.updatedAt)}</div>
            </div>
        </button>
    );
}
