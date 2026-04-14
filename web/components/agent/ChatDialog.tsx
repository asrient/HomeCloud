import { ChatView } from './ChatView';
import { ChatInfo } from 'shared/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { isWin11Theme } from '@/lib/utils';

export function ChatDialog({ chat, deviceFingerprint, onClose }: {
    chat: ChatInfo | null;
    deviceFingerprint: string | null;
    onClose: () => void;
}) {
    return (
        <Dialog open={!!chat} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="w-[90vw] max-w-[45rem] max-h-[85vh] p-0 gap-0">
                <DialogHeader className={
                    isWin11Theme() ? "px-6 py-4 overflow-hidden" : "px-4 py-2 overflow-hidden"
                }>
                    <DialogTitle className="truncate min-w-0">{chat?.title || 'Chat'}</DialogTitle>
                </DialogHeader>
                {chat && (
                    <ChatView
                        deviceFingerprint={deviceFingerprint}
                        chatId={chat.chatId}
                        className={
                            isWin11Theme() ? "h-[calc(85vh-3.5rem)]" :
                                "h-[calc(85vh-3rem)]"
                        }
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
