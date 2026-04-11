import { PageBar, PageContent, MenuButton, MenuGroup } from "@/components/pagePrimatives";
import { buildPageConfig, cn } from '@/lib/utils'
import Head from 'next/head'
import { useState, useMemo, useCallback } from 'react'
import { ThemedIconName } from "@/lib/enums";
import { useAgentConfig, useChatList } from "@/components/hooks/useAgent";
import { useAppState } from "@/components/hooks/useAppState";
import { ChatCard } from "@/components/agent/ChatCard";
import { ChatDialog } from "@/components/agent/ChatDialog";
import { NewChatDialog } from "@/components/agent/NewChatDialog";
import { ChatInfo } from "shared/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus } from 'lucide-react';

function KanbanColumn({ title, chats, onChatClick, border }: {
    title: string;
    chats: ChatInfo[];
    onChatClick: (chat: ChatInfo) => void;
    border?: boolean;
}) {
    return (
        <div className={cn("flex-1 flex flex-col min-w-0", border && "border-r border-border/40")}>
            <div className="text-sm font-medium text-foreground p-2 shrink-0">
                {title}
                {chats.length > 0 && <span className="ml-1.5 text-foreground/50">{chats.length}</span>}
            </div>
            <ScrollArea className="h-0 flex-1">
                <div className="space-y-1 p-2 pt-0">
                    {chats.map(chat => (
                        <ChatCard key={chat.chatId} chat={chat} onClick={() => onChatClick(chat)} />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}

function Page() {
    const { selectedFingerprint } = useAppState();
    const { config } = useAgentConfig(selectedFingerprint);
    const { chats, newChat } = useChatList(selectedFingerprint);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [showNewChat, setShowNewChat] = useState(false);
    const title = config?.name ?? 'Agent';

    const columns = useMemo(() => {
        const idle: ChatInfo[] = [];
        const working: ChatInfo[] = [];
        const attention: ChatInfo[] = [];
        for (const chat of chats) {
            switch (chat.status) {
                case 'idle': idle.push(chat); break;
                case 'working': working.push(chat); break;
                case 'asking':
                case 'error': attention.push(chat); break;
            }
        }
        return { idle, working, attention };
    }, [chats]);

    const selectedChat = useMemo(() =>
        chats.find(c => c.chatId === selectedChatId) ?? null
        , [chats, selectedChatId]);

    const openChat = useCallback((chat: ChatInfo) => {
        setSelectedChatId(chat.chatId);
    }, []);

    const handleNewChat = useCallback(async (cwd?: string) => {
        try {
            const chat = await newChat(cwd);
            setShowNewChat(false);
            setSelectedChatId(chat.chatId);
        } catch (err: any) {
            console.error('Failed to create chat:', err);
        }
    }, [newChat]);

    return (
        <>
            <Head>
                <title>{title}</title>
            </Head>

            <PageBar icon={ThemedIconName.AI} title={title}>
                <MenuGroup>
                    <MenuButton title="New Chat" onClick={() => setShowNewChat(true)}>
                        <Plus size={16} />
                    </MenuButton>
                </MenuGroup>
            </PageBar>
            <PageContent>
                <div className="h-full flex">
                    <KanbanColumn title="Idle" chats={columns.idle} onChatClick={openChat} border />
                    <KanbanColumn title="In Progress" chats={columns.working} onChatClick={openChat} border />
                    <KanbanColumn title="Needs Attention" chats={columns.attention} onChatClick={openChat} />
                </div>

                <ChatDialog
                    chat={selectedChat}
                    deviceFingerprint={selectedFingerprint}
                    onClose={() => setSelectedChatId(null)}
                />
                <NewChatDialog
                    open={showNewChat}
                    onClose={() => setShowNewChat(false)}
                    onCreate={handleNewChat}
                    fingerprint={selectedFingerprint}
                />
            </PageContent>
        </>
    )
}

Page.config = buildPageConfig()
export default Page
