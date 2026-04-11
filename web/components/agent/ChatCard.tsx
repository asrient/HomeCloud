import { cn, formatDate } from '@/lib/utils';
import { ChatInfo, ChatStatus } from 'shared/types';

const statusColors: Record<ChatStatus, string> = {
    idle: 'border-l-gray-500/40',
    working: 'border-l-blue-500/40',
    asking: 'border-l-amber-500/40',
    error: 'border-l-red-500/40',
};

export function ChatCard({ chat, onClick }: {
    chat: ChatInfo;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex flex-col w-full text-left rounded-[4px] border-border/40 border-l-[4px]', 
                'bg-secondary/40 px-2 py-4 hover:bg-secondary transition-colors',
                statusColors[chat.status],
            )}
        >
            <div className="text-sm font-normal truncate">
                {chat.title || 'Untitled chat'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
                {formatDate(chat.updatedAt)}
            </div>
        </button>
    );
}
