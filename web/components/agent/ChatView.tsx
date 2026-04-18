import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import { useChat } from '@/components/hooks/useAgent';
import { AgentMessage, AgentMessageEntry, AgentToolCall, ChatStatus, AgentPermissionRequest, ChatConfigOption } from 'shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Square, ShieldQuestion, ArrowUp, Check, CircleDashed, CircleX, ChevronDown } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { getLocalServiceController } from '@/lib/utils';

const markdownComponents = {
    a: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <Button
            variant="link"
            className="p-0 h-auto"
            onClick={() => {
                if (href) {
                    getLocalServiceController().system.openUrl(href).catch(console.error);
                }
            }}
        >
            {children}
        </Button>
    ),
};

// ── Message bubble ──

function ToolCallRow({ tc }: { tc: AgentToolCall }) {
    return (
        <div className="text-xs rounded px-2 py-1 text-foreground/60 font-normal flex items-center">
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
    );
}

const MessageBubble = memo(function MessageBubble({ message }: { message: AgentMessage }) {
    const isUser = message?.role === 'user';
    const segments: AgentMessageEntry[] = message?.entries ?? [];
    const hasAnyContent = segments.length > 0;

    return (
        <div className={cn('flex select-text',
            isUser ? 'justify-end' : 'justify-start')}>
            <div className={cn(
                ' px-3 py-2.5 text-sm break-words max-w-[80%]',
                isUser ? 'bg-secondary/50 text-secondary-foreground rounded-xl whitespace-pre-wrap' : 'prose prose-sm dark:prose-invert prose-p:my-1 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 prose-li:my-0 max-w-none'
            )}>
                {!hasAnyContent ? (
                    <span className="text-muted-foreground italic">{'(non-text content)'}</span>
                ) : segments.map((seg, i) => {
                    if (seg.kind === 'tool_call') {
                        if (!seg.toolCall.title) return null;
                        return <ToolCallRow key={`tool-${seg.toolCall.toolCallId}-${i}`} tc={seg.toolCall} />;
                    }
                    if (seg.kind === 'thought') {
                        if (seg.content.type !== 'text') return null;
                        return (
                            <div key={`thought-${i}`} className="my-1 text-xs text-muted-foreground whitespace-pre-wrap italic">
                                {seg.content.text}
                            </div>
                        );
                    }
                    // content
                    if (seg.content.type !== 'text') return null;
                    if (isUser) {
                        return <span key={`text-${i}`}>{seg.content.text}</span>;
                    }
                    return (
                        <ReactMarkdown key={`text-${i}`} remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {seg.content.text}
                        </ReactMarkdown>
                    );
                })}
            </div>
        </div>
    );
});

// ── Status indicator ──

function StatusBar({ status }: { status: ChatStatus }) {
    if (status === 'idle') return null;
    const labels: Record<string, string> = {
        working: 'Agent is working...',
        asking: 'Agent needs permission',
        error: 'Error occurred',
    };
    const colors: Record<string, string> = {
        working: 'text-primary',
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
        configOptions, sendMessage, cancelMessage,
        respondToPermission, setChatConfig,
    } = useChat(deviceFingerprint, chatId);

    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const hasScrolledRef = useRef(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
    }, []);

    // Scroll to end on load and during streaming
    useEffect(() => {
        if (messages.length > 0 && !isLoading) {
            if (!hasScrolledRef.current) {
                hasScrolledRef.current = true;
                setTimeout(() => scrollToBottom(), 100);
            } else if (status === 'working') {
                scrollToBottom();
            }
        }
    }, [messages, isLoading, status, scrollToBottom]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSend = useCallback(() => {
        const text = input.trim();
        if (!text || status === 'working') return;
        setInput('');
        sendMessage(text);
        setTimeout(() => scrollToBottom(), 100);
    }, [input, status, sendMessage, scrollToBottom]);

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
                <div className="space-y-1 py-4">
                    {isLoading && messages.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>
                    )}
                    {!isLoading && messages.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-8">Ready when you are.</div>
                    )}
                    {messages.map((msg, i) => (
                        <MessageBubble key={i} message={msg} />
                    ))}
                    <div ref={bottomRef} />
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
            <div className="border-t border-border/40 p-2 flex flex-col gap-1">
                <div className="flex items-center gap-1">
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
                {configOptions.length > 0 && (
                    <div className="flex items-center gap-1 px-1">
                        {configOptions.map(opt => (
                            <DropdownMenu key={opt.key}>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground gap-1">
                                        {opt.values.find(v => v.value === opt.currentValue)?.name ?? opt.currentValue}
                                        <ChevronDown className="w-3 h-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    {opt.values.map(v => (
                                        <DropdownMenuItem
                                            key={v.value}
                                            onClick={() => setChatConfig(opt.key, v.value)}
                                            className={cn(v.value === opt.currentValue && 'font-semibold')}
                                        >
                                            {v.name}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
