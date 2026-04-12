import { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useChat } from '@/components/hooks/useAgent';
import { AgentMessage, AgentContentBlock, ChatStatus, AgentPermissionRequest } from 'shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Square, ShieldQuestion, ArrowUp, Check, CircleDashed, CircleX } from 'lucide-react';
import { Textarea } from '../ui/textarea';

// ── Message bubble ──

function MessageBubble({ message }: { message: AgentMessage }) {
    const isUser = message.role === 'user';

    const textContent = message.content
        .filter((b): b is Extract<AgentContentBlock, { type: 'text' }> => b.type === 'text')
        .map(b => b.text)
        .join('').trim();

    return (
        <div className={cn('flex select-text',
            isUser ? 'justify-end' : 'justify-start')}>
            <div className={cn(
                ' px-3 py-2.5 text-sm whitespace-pre-wrap break-words max-w-[80%]',
                isUser && 'bg-secondary/50 text-secondary-foreground rounded-xl'
            )}>
                {textContent || <span className="text-muted-foreground italic">{'(non-text content)'}</span>}

                {/* Tool calls */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                        {message.toolCalls.map(tc => (
                            <div key={tc.toolCallId} className="text-xs rounded px-2 py-1 text-foreground/60 font-normal flex items-center">
                                {tc.status && (
                                    <span className='mr-1'>
                                        {tc.status === 'completed' ?
                                            <Check className="w-3 h-3" /> :
                                            tc.status === 'failed' ?
                                                <CircleX className="w-3 h-3 text-red-500/70" /> :
                                                tc.status === 'in_progress' ?
                                                    <CircleDashed className="w-3 h-3 text-blue-500/70" /> :
                                                    <Square className="w-3 h-3" />
                                        }
                                    </span>
                                )}
                                <span>{tc.title}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Thoughts (collapsed) */}
                {message.thoughts && message.thoughts.length > 0 && (
                    <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer select-none">Thoughts</summary>
                        <div className="mt-1 whitespace-pre-wrap">
                            {message.thoughts
                                .filter((b): b is Extract<AgentContentBlock, { type: 'text' }> => b.type === 'text')
                                .map(b => b.text)
                                .join('')}
                        </div>
                    </details>
                )}
            </div>
        </div>
    );
}

// ── Status indicator ──

function StatusBar({ status }: { status: ChatStatus }) {
    if (status === 'idle') return null;
    const labels: Record<string, string> = {
        working: 'Agent is working...',
        asking: 'Agent needs permission',
        error: 'Error occurred',
    };
    const colors: Record<string, string> = {
        working: 'text-blue-500',
        asking: 'text-amber-500',
        error: 'text-red-500',
    };
    return (
        <div className={cn('text-xs py-1 text-center', colors[status] ?? 'text-muted-foreground')}>
            {labels[status] ?? status}
        </div>
    );
}

// ── Permission prompt ──

function PermissionPrompt({ permission, onRespond }: {
    permission: AgentPermissionRequest;
    onRespond: (optionId: string) => void;
}) {
    return (
        <div className="border border-primary/30 rounded-sm p-4">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <ShieldQuestion className="w-3 h-3" />
                    Agent is requesting permission to:
            </div>
            <div className="flex items-center gap-2 text-xs font-normal mb-3">

                {permission.toolCall.title}
            </div>

            <div className="flex flex-wrap gap-1.5">
                {permission.options.map(opt => (
                    <Button
                        key={opt.optionId}
                        size="sm"
                        variant={opt.kind.startsWith('allow') ? 'secondary' : 'ghost'}
                        className="text-xs h-7"
                        onClick={() => onRespond(opt.optionId)}
                    >
                        {opt.name}
                    </Button>
                ))}
            </div>
        </div>
    );
}

// ── Main chat view ──

export function ChatView({ deviceFingerprint, chatId, className }: {
    deviceFingerprint: string | null;
    chatId: string;
    className?: string;
}) {
    const {
        messages, status, isLoading, pendingPermission,
        sendMessage, cancelMessage, respondToPermission,
    } = useChat(deviceFingerprint, chatId);

    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // For demo purposes, simulate a pending permission
    // pendingPermission = {
    //     chatId,
    //     toolCall: {
    //         toolCallId: 'demo-tool-call',
    //         title: 'Access your calendar',
    //     },
    //     options: [
    //         { optionId: 'allow_calendar', name: 'Allow', kind: 'allow_once' },
    //         { optionId: 'deny_calendar', name: 'Deny', kind: 'reject_once' },
    //     ],
    // }

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, status, pendingPermission]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSend = useCallback(() => {
        const text = input.trim();
        if (!text || status === 'working') return;
        setInput('');
        sendMessage(text);
    }, [input, status, sendMessage]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    return (
        <div className={cn("flex flex-col overflow-hidden", className)}>
            {/* Messages */}
            <ScrollArea className="flex-1 px-4 h-0">
                <div ref={scrollRef} className="space-y-1 py-4">
                    {isLoading && messages.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>
                    )}
                    {!isLoading && messages.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-8">No messages yet. Start a conversation.</div>
                    )}
                    {messages.map((msg, i) => (
                        <MessageBubble key={i} message={msg} />
                    ))}
                </div>
            </ScrollArea>

            {/* Permission prompt — outside scroll area so always visible */}
            {pendingPermission && (
                <div className="px-4 pb-2">
                    <PermissionPrompt
                        permission={pendingPermission}
                        onRespond={respondToPermission}
                    />
                </div>
            )}

            {/* Status */}
            <StatusBar status={status} />

            {/* Input */}
            <div className="border-t border-border/40 p-2 flex items-center gap-1">
                <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    disabled={status === 'working' || status === 'asking'}
                    className="flex-1 max-h-32 min-h-[2.5rem] border-none resize-none focus:ring-0 focus-visible:ring-0"
                />
                {status === 'working' ? (
                    <Button size="icon" variant="ghost" onClick={cancelMessage} title="Cancel">
                        <Square className="w-4 h-4" />
                    </Button>
                ) : (
                    <Button size="icon" variant="link" onClick={handleSend} disabled={!input.trim() || status === 'asking'} title="Send">
                        <ArrowUp className="w-4 h-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}
