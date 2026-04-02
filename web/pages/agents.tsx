import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { PageBar, PageContent } from '@/components/pagePrimatives';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, getLocalServiceController, isMacosTheme } from '@/lib/utils';
import { Settings, Plus, Send, ChevronDown, ChevronUp, Bot, Square, ShieldCheck, ShieldX, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DialogHeader, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LoadingIcon from '@/components/ui/loadingIcon';
import type {
    AgentInfo,
    AgentSessionInfo,
    AgentSessionState,
    AgentNewSessionResult,
    AgentConfig,
    AgentConfigOption,
    AgentPermissionRequest,
    AgentPermissionOption,
    AgentSessionSignalEvent,
    AgentStatus,
} from 'shared/types';
import type { SignalNodeRef } from 'shared/signals';
import type ServiceController from 'shared/controller';
import { Textarea } from '@/components/ui/textarea';

// ── Hooks ──

function useAgentService() {
    const sc = useMemo(() => {
        try { return getLocalServiceController(); } catch { return null; }
    }, []);
    return sc?.agent ?? null;
}

function useAgentAvailable() {
    const agentService = useAgentService();
    const [available, setAvailable] = useState<boolean | null>(null);

    useEffect(() => {
        if (!agentService) { setAvailable(false); return; }
        agentService.isAvailable().then(setAvailable).catch(() => setAvailable(false));
    }, [agentService]);

    return available;
}

function useAgents() {
    const agentService = useAgentService();
    const [agents, setAgents] = useState<AgentInfo[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        if (!agentService) return;
        setLoading(true);
        try {
            const list = await agentService.listAgents();
            setAgents(list);
        } catch (e) {
            console.error('Failed to list agents:', e);
        } finally {
            setLoading(false);
        }
    }, [agentService]);

    useEffect(() => { refresh(); }, [refresh]);

    return { agents, loading, refresh, setAgents };
}

function useSessions(agentId: string | null) {
    const agentService = useAgentService();
    const [sessions, setSessions] = useState<AgentSessionInfo[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!agentService || !agentId) { setSessions([]); return; }
        setLoading(true);
        try {
            const list = await agentService.listSessions(agentId);
            setSessions(list);
        } catch {
            setSessions([]);
        } finally {
            setLoading(false);
        }
    }, [agentService, agentId]);

    useEffect(() => { refresh(); }, [refresh]);

    const updateSession = useCallback((sessionId: string, patch: Partial<AgentSessionInfo>) => {
        setSessions(prev => prev.map(s =>
            s.sessionId === sessionId ? { ...s, ...patch } : s
        ));
    }, []);

    return { sessions, loading, refresh, updateSession };
}

// ── Signal subscriptions hook ──

function useAgentSignals({
    onSessionEvent,
    onPermissionRequest,
    onAgentStatus,
}: {
    onSessionEvent: (agentId: string, sessionId: string, event: AgentSessionSignalEvent) => void;
    onPermissionRequest: (request: AgentPermissionRequest) => void;
    onAgentStatus: (agentId: string, status: AgentStatus) => void;
}) {
    const sessionEventRef = useRef<SignalNodeRef<any, any> | null>(null);
    const permissionRef = useRef<SignalNodeRef<any, any> | null>(null);
    const agentStatusRef = useRef<SignalNodeRef<any, any> | null>(null);

    const onSessionEventRef = useRef(onSessionEvent);
    onSessionEventRef.current = onSessionEvent;
    const onPermissionRequestRef = useRef(onPermissionRequest);
    onPermissionRequestRef.current = onPermissionRequest;
    const onAgentStatusRef = useRef(onAgentStatus);
    onAgentStatusRef.current = onAgentStatus;

    useEffect(() => {
        let sc: ServiceController;
        try { sc = getLocalServiceController(); } catch { return; }
        const agent = sc.agent;
        if (!agent) return;

        sessionEventRef.current = agent.sessionEventSignal.add((agentId: string, sessionId: string, event: AgentSessionSignalEvent) => {
            onSessionEventRef.current(agentId, sessionId, event);
        });

        permissionRef.current = agent.permissionRequestSignal.add((request: AgentPermissionRequest) => {
            onPermissionRequestRef.current(request);
        });

        agentStatusRef.current = agent.agentStatusSignal.add((agentId: string, status: AgentStatus) => {
            onAgentStatusRef.current(agentId, status);
        });

        return () => {
            if (sessionEventRef.current) agent.sessionEventSignal.detach(sessionEventRef.current);
            if (permissionRef.current) agent.permissionRequestSignal.detach(permissionRef.current);
            if (agentStatusRef.current) agent.agentStatusSignal.detach(agentStatusRef.current);
            sessionEventRef.current = null;
            permissionRef.current = null;
            agentStatusRef.current = null;
        };
    }, []);
}

// ── Session List Item ──

function SessionRow({ session, isSelected, onClick }: {
    session: AgentSessionInfo;
    isSelected: boolean;
    onClick: () => void;
}) {
    const stateLabel = useMemo(() => {
        switch (session.state) {
            case 'processing': return 'Processing...';
            case 'need_attention': return 'Waiting for approval';
            case 'error': return 'Error';
            default: return null;
        }
    }, [session.state]);

    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full text-left px-4 py-2.5 border-b border-border/40 hover:bg-accent/50 transition-colors",
                isSelected && "bg-accent"
            )}
        >
            <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{session.title || 'Untitled chat'}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {stateLabel || session.agentId}
                    </div>
                </div>
                {session.updatedAt && (
                    <div className="text-xs text-muted-foreground shrink-0 ml-2">
                        {formatRelativeTime(session.updatedAt)}
                    </div>
                )}
            </div>
        </button>
    );
}

// ── Grouped Session List ──

type SessionGroupType = {
    title: string;
    state: AgentSessionState;
    sessions: AgentSessionInfo[];
};

const GROUP_ORDER: AgentSessionState[] = ['need_attention', 'processing', 'idle', 'error'];
const GROUP_LABELS: Record<AgentSessionState, string> = {
    need_attention: 'Attention required',
    processing: 'In progress',
    idle: 'Ready',
    error: 'Error',
};

const COLLAPSED_LIMIT = 2;

function SessionGroupView({ group, selectedSessionId, onSelect }: {
    group: SessionGroupType;
    selectedSessionId: string | null;
    onSelect: (session: AgentSessionInfo) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const needsExpand = group.sessions.length > COLLAPSED_LIMIT;
    const visible = expanded ? group.sessions : group.sessions.slice(0, COLLAPSED_LIMIT);
    const isHighlight = group.state === 'need_attention' || group.state === 'processing';

    return (
        <div className={cn(
            "mb-2",
            isHighlight && "bg-accent/30 rounded-lg border border-border/50"
        )}>
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {group.title} ({group.sessions.length})
                </h3>
            </div>
            {visible.map((session) => (
                <SessionRow
                    key={session.sessionId}
                    session={session}
                    isSelected={selectedSessionId === session.sessionId}
                    onClick={() => onSelect(session)}
                />
            ))}
            {needsExpand && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="w-full px-4 py-1.5 text-xs text-primary hover:underline flex items-center gap-1"
                >
                    {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {expanded ? 'Show less' : `Show more...`}
                </button>
            )}
        </div>
    );
}

function GroupedSessionList({ sessions, selectedSessionId, onSelect }: {
    sessions: AgentSessionInfo[];
    selectedSessionId: string | null;
    onSelect: (session: AgentSessionInfo) => void;
}) {
    const groups = useMemo((): SessionGroupType[] => {
        const grouped = new Map<AgentSessionState, AgentSessionInfo[]>();
        for (const session of sessions) {
            const list = grouped.get(session.state) || [];
            list.push(session);
            grouped.set(session.state, list);
        }
        return GROUP_ORDER
            .filter(state => grouped.has(state))
            .map(state => ({
                title: GROUP_LABELS[state],
                state,
                sessions: grouped.get(state)!,
            }));
    }, [sessions]);

    if (sessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm py-10">
                <Bot size={32} className="mb-2 opacity-40" />
                <div>No sessions yet</div>
                <div className="text-xs mt-1">Start a new chat to begin</div>
            </div>
        );
    }

    return (
        <div className="py-1">
            {groups.map((group) => (
                <SessionGroupView
                    key={group.state}
                    group={group}
                    selectedSessionId={selectedSessionId}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
}

// ── Permission Banner ──

function PermissionBanner({ request, onRespond }: {
    request: AgentPermissionRequest;
    onRespond: (toolCallId: string, optionId: string) => void;
}) {
    return (
        <div className="mx-0 my-2 p-3 rounded-lg border border-amber-500/40 bg-amber-500/5">
            <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{request.title}</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {request.options.map((opt) => (
                            <Button
                                key={opt.optionId}
                                size="sm"
                                variant={opt.kind === 'allow_once' || opt.kind === 'allow_always' ? 'default' : 'ghost'}
                                className={cn(
                                    "h-7 text-xs",
                                    (opt.kind === 'reject_once' || opt.kind === 'reject_always') && "text-destructive"
                                )}
                                onClick={() => onRespond(request.toolCallId, opt.optionId)}
                            >
                                {(opt.kind === 'allow_once' || opt.kind === 'allow_always')
                                    ? <ShieldCheck size={12} className="mr-1" />
                                    : <ShieldX size={12} className="mr-1" />
                                }
                                {opt.name}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Chat Panel ──

type ChatMessage = {
    role: 'user' | 'agent' | 'system';
    text: string;
};

function ChatPanel({ agentId, session, agentName, permissionRequests, onPermissionRespond }: {
    agentId: string;
    session: AgentSessionInfo | null;
    agentName: string;
    permissionRequests: AgentPermissionRequest[];
    onPermissionRespond: (toolCallId: string, optionId: string) => void;
}) {
    const agentService = useAgentService();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [streamText, setStreamText] = useState('');
    const [loadingSession, setLoadingSession] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Per-session message cache — survives session switches
    const messageCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
    const prevSessionIdRef = useRef<string | null>(null);

    // Save messages to cache when switching away, restore when switching back
    useEffect(() => {
        // Save previous session's messages
        if (prevSessionIdRef.current && prevSessionIdRef.current !== session?.sessionId) {
            messageCacheRef.current.set(prevSessionIdRef.current, messages);
        }
        prevSessionIdRef.current = session?.sessionId ?? null;

        if (!session) {
            setMessages([]);
            setStreamText('');
            return;
        }

        // Restore from cache if available
        const cached = messageCacheRef.current.get(session.sessionId);
        if (cached && cached.length > 0) {
            setMessages(cached);
            setStreamText('');
        } else {
            setMessages([]);
            setStreamText('');
        }
    }, [session?.sessionId]);

    // Combined: set up stream FIRST, then load session history (only if no cached messages)
    useEffect(() => {
        if (!agentService || !session) return;

        const sessionId = session.sessionId;
        const hasCachedMessages = (messageCacheRef.current.get(sessionId)?.length ?? 0) > 0;

        let cancelled = false;
        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

        (async () => {
            try {
                // 1. Set up stream BEFORE loading session so replay events aren't lost
                const stream = await agentService.streamSession(agentId, sessionId);
                if (cancelled) return;
                reader = stream.getReader();

                // 2. Load session history only if we don't have cached messages
                if (!hasCachedMessages) {
                    try {
                        setLoadingSession(true);
                        await agentService.loadSession(agentId, sessionId, session.cwd);
                    } catch {
                        // loadSession not supported or failed
                    } finally {
                        if (!cancelled) setLoadingSession(false);
                    }
                }

                // 3. Read streamed events (both replayed history and live events)
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { value, done } = await reader.read();
                    if (done || cancelled) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const event = JSON.parse(line);
                            handleStreamEvent(event);
                        } catch { /* skip */ }
                    }
                }
            } catch (e) {
                if (!cancelled) console.error('Stream error:', e);
            }
        })();

        return () => {
            cancelled = true;
            reader?.cancel().catch(() => { });
        };
    }, [agentService, agentId, session]);

    const handleStreamEvent = useCallback((event: any) => {
        switch (event.eventType) {
            case 'agent_message_chunk':
                if (event.content?.type === 'text') {
                    setStreamText(prev => prev + event.content.text);
                }
                break;
            case 'user_message_chunk':
                if (event.content?.type === 'text') {
                    setMessages(prev => [...prev, { role: 'user', text: event.content.text }]);
                }
                break;
            case 'tool_call':
                setMessages(prev => [...prev, {
                    role: 'system',
                    text: `🔧 ${event.title} (${event.kind || 'tool'})`,
                }]);
                break;
            case 'session_state_change':
                if (event.state === 'idle' || event.state === 'error') {
                    setStreamText(prev => {
                        if (prev) {
                            setMessages(msgs => [...msgs, { role: 'agent', text: prev }]);
                        }
                        return '';
                    });
                    setSending(false);
                }
                break;
        }
    }, []);

    // Auto-scroll
    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamText, permissionRequests]);

    const handleSend = useCallback(async () => {
        if (!agentService || !session || !input.trim() || sending) return;
        const text = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text }]);
        setSending(true);
        setStreamText('');
        try {
            await agentService.sendMessage(agentId, session.sessionId, text);
        } catch (e: any) {
            setMessages(prev => [...prev, { role: 'agent', text: `Error: ${e.message || e}` }]);
        } finally {
            setSending(false);
        }
    }, [agentService, agentId, session, input, sending]);

    const handleCancel = useCallback(async () => {
        if (!agentService || !session) return;
        try {
            await agentService.cancelPrompt(agentId, session.sessionId);
        } catch { /* best effort */ }
    }, [agentService, agentId, session]);

    const sessionPermissions = useMemo(() =>
        permissionRequests.filter(r => r.sessionId === session?.sessionId),
        [permissionRequests, session]
    );

    if (!session) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <Bot size={40} className="mb-3 opacity-30" />
                <div className="text-sm">Select a chat or start a new one</div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full">
            <div className="shrink-0 px-4 py-3 border-b border-border/40">
                <div className="font-medium text-sm">{session.title || 'New Chat'}</div>
            </div>

            <ScrollArea className="flex-1 px-4 py-3">
                {loadingSession && (
                    <div className="flex justify-center py-4"><LoadingIcon /></div>
                )}
                <div className="space-y-3">
                    {messages.map((msg, i) => (
                        <div key={i} className={cn(
                            "text-sm whitespace-pre-wrap",
                            msg.role === 'user' && 'text-foreground',
                            msg.role === 'agent' && 'text-muted-foreground',
                            msg.role === 'system' && 'text-xs text-muted-foreground/70 italic',
                        )}>
                            {msg.role !== 'system' && (
                                <span className="font-medium text-xs uppercase tracking-wide block mb-0.5">
                                    {msg.role === 'user' ? 'You' : agentName}
                                </span>
                            )}
                            {msg.text}
                        </div>
                    ))}
                    {streamText && (
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                            <span className="font-medium text-xs uppercase tracking-wide block mb-0.5">{agentName}</span>
                            {streamText}
                            <span className="inline-block w-1.5 h-4 bg-foreground/50 ml-0.5 animate-pulse" />
                        </div>
                    )}

                    {sessionPermissions.map((req) => (
                        <PermissionBanner
                            key={req.toolCallId}
                            request={req}
                            onRespond={onPermissionRespond}
                        />
                    ))}

                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            <div className="shrink-0 px-4 py-3 border-t border-border/40">
                <div className="flex items-center justify-end mb-2">
                    <div className="text-xs border rounded-full px-2.5 py-0.5 text-muted-foreground flex items-center gap-1">
                        {agentName}
                        <ChevronDown size={10} />
                    </div>
                </div>
                <div className="flex items-end gap-2">
                    <Textarea
                        placeholder="Type here"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        className="flex-1 min-h-[2.5rem] max-h-[8rem] resize-none text-sm"
                        rows={1}
                    />
                    {sending ? (
                        <Button size="sm" variant="ghost" onClick={handleCancel} title="Cancel">
                            <Square size={16} />
                        </Button>
                    ) : (
                        <Button size="sm" variant="ghost" onClick={handleSend} disabled={!input.trim()} title="Send">
                            <Send size={16} />
                        </Button>
                    )}
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <button className="hover:text-foreground">Mode &gt;</button>
                    <button className="hover:text-foreground">Model &gt;</button>
                </div>
            </div>
        </div>
    );
}

// ── Configure Dialog ──

function ConfigureDialog({ open, onOpenChange, onAgentAdded }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAgentAdded: () => void;
}) {
    const agentService = useAgentService();
    const [name, setName] = useState('');
    const [command, setCommand] = useState('');
    const [args, setArgs] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    const handleAdd = useCallback(async () => {
        if (!agentService || !name.trim() || !command.trim()) return;
        setSaving(true);
        try {
            const config: AgentConfig = {
                name: name.trim(),
                command: command.trim(),
                args: args.trim() ? args.trim().split(/\s+/) : [],
                description: description.trim() || undefined,
            };
            await agentService.addAgent(config);
            setName('');
            setCommand('');
            setArgs('');
            setDescription('');
            onOpenChange(false);
            onAgentAdded();
        } catch (e: any) {
            alert(`Failed to add agent: ${e.message || e}`);
        } finally {
            setSaving(false);
        }
    }, [agentService, name, command, args, description, onOpenChange, onAgentAdded]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Agent</DialogTitle>
                    <DialogDescription>Register an ACP-compatible coding agent.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="agent-name">Name</Label>
                        <Input id="agent-name" placeholder="e.g. OpenCode" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="agent-command">Command</Label>
                        <Input id="agent-command" placeholder="e.g. opencode" value={command} onChange={(e) => setCommand(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="agent-args">Arguments (space-separated)</Label>
                        <Input id="agent-args" placeholder="e.g. --acp" value={args} onChange={(e) => setArgs(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="agent-desc">Description</Label>
                        <Input id="agent-desc" placeholder="Optional description" value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleAdd} disabled={!name.trim() || !command.trim() || saving}>
                        {saving ? <LoadingIcon /> : 'Add Agent'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Helpers ──

function formatRelativeTime(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        const now = Date.now();
        const diffMs = now - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    } catch {
        return '';
    }
}

// ── Main Page ──

export default function AgentsPage() {
    const available = useAgentAvailable();
    const { agents, loading: agentsLoading, refresh: refreshAgents, setAgents } = useAgents();
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [selectedSession, setSelectedSession] = useState<AgentSessionInfo | null>(null);
    const [configOpen, setConfigOpen] = useState(false);
    const [permissionRequests, setPermissionRequests] = useState<AgentPermissionRequest[]>([]);

    const agentService = useAgentService();

    // Auto-select first agent
    useEffect(() => {
        if (!selectedAgentId && agents.length > 0) {
            setSelectedAgentId(agents[0].id);
        }
    }, [agents, selectedAgentId]);

    const selectedAgent = useMemo(() => agents.find(a => a.id === selectedAgentId), [agents, selectedAgentId]);

    const { sessions, loading: sessionsLoading, refresh: refreshSessions, updateSession } = useSessions(selectedAgentId);

    // ── Signal subscriptions ──

    const handleSessionEvent = useCallback((agentId: string, sessionId: string, event: AgentSessionSignalEvent) => {
        if (event.eventType === 'session_state_change') {
            updateSession(sessionId, { state: event.state });
        } else if (event.eventType === 'session_info_update') {
            updateSession(sessionId, {
                title: event.title ?? undefined,
                updatedAt: event.updatedAt ?? undefined,
            });
        }
    }, [updateSession]);

    const handlePermissionRequest = useCallback((request: AgentPermissionRequest) => {
        setPermissionRequests(prev => [...prev, request]);
    }, []);

    const handleAgentStatus = useCallback((agentId: string, status: AgentStatus) => {
        setAgents(prev => prev.map(a =>
            a.id === agentId ? { ...a, status } : a
        ));
    }, [setAgents]);

    useAgentSignals({
        onSessionEvent: handleSessionEvent,
        onPermissionRequest: handlePermissionRequest,
        onAgentStatus: handleAgentStatus,
    });

    // ── Permission response ──

    const handlePermissionRespond = useCallback(async (toolCallId: string, optionId: string) => {
        if (!agentService) return;
        const request = permissionRequests.find(r => r.toolCallId === toolCallId);
        if (!request) return;
        try {
            await agentService.respondToPermission(request.agentId, {
                toolCallId,
                selectedOptionId: optionId,
            });
        } catch (e: any) {
            console.error('Failed to respond to permission:', e);
        }
        setPermissionRequests(prev => prev.filter(r => r.toolCallId !== toolCallId));
    }, [agentService, permissionRequests]);

    const handleNewChat = useCallback(async () => {
        if (!agentService || !selectedAgentId) return;
        try {
            const result = await agentService.newSession(selectedAgentId, '');
            await refreshSessions();
            setSelectedSession({
                sessionId: result.sessionId,
                agentId: result.agentId,
                cwd: result.cwd,
                state: 'idle',
            });
        } catch (e: any) {
            alert(`Failed to create session: ${e.message || e}`);
        }
    }, [agentService, selectedAgentId, refreshSessions]);

    // ── Unavailable state ──

    if (available === false) {
        return (
            <>
                <Head><title>Agents</title></Head>
                <PageBar title="Agents" />
                <PageContent>
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <Bot size={48} className="mb-3 opacity-30" />
                        <div className="text-sm">Agent service is not available on this device.</div>
                    </div>
                </PageContent>
            </>
        );
    }

    return (
        <>
            <Head><title>Agents</title></Head>
            <PageBar title={getPageTitle(selectedAgent)}>
                <Button size='sm' variant='ghost' onClick={() => setConfigOpen(true)} title="Configure">
                    <Settings size={16} />
                    <span className="ml-1 text-xs hidden md:inline">Configure</span>
                </Button>
            </PageBar>
            <PageContent className="flex">
                <div className="flex w-full h-full">
                    <div className={cn(
                        "shrink-0 border-r border-border/40 flex flex-col",
                        "w-[280px] lg:w-[320px]"
                    )}>
                        <div className="shrink-0 px-3 py-2 border-b border-border/40">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="w-full justify-start text-sm"
                                onClick={handleNewChat}
                                disabled={!selectedAgentId}
                            >
                                <Plus size={14} className="mr-1.5" />
                                New Chat
                            </Button>
                        </div>
                        <ScrollArea className="flex-1">
                            {agentsLoading || sessionsLoading ? (
                                <div className="flex justify-center py-8"><LoadingIcon /></div>
                            ) : (
                                <GroupedSessionList
                                    sessions={sessions}
                                    selectedSessionId={selectedSession?.sessionId ?? null}
                                    onSelect={setSelectedSession}
                                />
                            )}
                        </ScrollArea>
                    </div>

                    <ChatPanel
                        agentId={selectedAgentId || ''}
                        session={selectedSession}
                        agentName={selectedAgent?.name || 'Agent'}
                        permissionRequests={permissionRequests}
                        onPermissionRespond={handlePermissionRespond}
                    />
                </div>
            </PageContent>

            <ConfigureDialog
                open={configOpen}
                onOpenChange={setConfigOpen}
                onAgentAdded={refreshAgents}
            />
        </>
    );
}

function getPageTitle(agent: AgentInfo | undefined): string {
    if (agent) return agent.name;
    return 'Agents';
}
