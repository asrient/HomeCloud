import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AgentConfig, AgentStatus, ChatInfo, ChatStatus, AgentMessage,
    AgentChatUpdate, AgentPermissionRequest, ChatConfigOption, AgentContentBlock,
    SignalEvent,
} from 'shared/types';
import ServiceController from 'shared/controller';
import { SignalNodeRef } from 'shared/signals';
import { useResource } from './useResource';
import { isMethodAvailable } from '@/lib/utils';

// ── useAgentAvailable ───────────────────────────────────────────────────────

export function useAgentAvailable(deviceFingerprint: string | null) {
    const [available, setAvailable] = useState<boolean | null>(null);

    const load = useCallback(async (sc: ServiceController, shouldAbort: () => boolean) => {
        const result = await isMethodAvailable(sc, 'agent.getAgentConfig');
        if (shouldAbort()) return;
        setAvailable(result);
    }, []);

    const { isLoading } = useResource({ deviceFingerprint, load });

    return { available, isLoading };
}

// ── useAgentConfig ──────────────────────────────────────────────────────────

export function useAgentConfig(deviceFingerprint: string | null) {
    const [config, setConfig] = useState<AgentConfig | null>(null);
    const [status, setStatus] = useState<AgentStatus>({ connectionStatus: 'disconnected' });
    const [presets, setPresets] = useState<AgentConfig[]>([]);
    const signalRef = useRef<SignalNodeRef<[SignalEvent, { status: AgentStatus; config: AgentConfig | null }], string> | null>(null);
    const scRef = useRef<ServiceController | null>(null);

    const load = useCallback(async (sc: ServiceController, shouldAbort: () => boolean) => {
        const [cfg, st, pr] = await Promise.all([
            sc.agent.getAgentConfig(),
            sc.agent.getStatus(),
            sc.agent.getAgentConfigPresets(),
        ]);
        if (shouldAbort()) return;
        setConfig(cfg);
        setStatus(st);
        setPresets(pr);
        scRef.current = sc;
    }, []);

    const setupSignals = useCallback((sc: ServiceController) => {
        signalRef.current = sc.agent.agentSignal.add((_event, data) => {
            setStatus(data.status);
            setConfig(data.config);
        });
    }, []);

    const clearSignals = useCallback((sc: ServiceController) => {
        if (signalRef.current) {
            sc.agent.agentSignal.detach(signalRef.current);
            signalRef.current = null;
        }
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
    });

    const setAgentConfig = useCallback(async (cfg: AgentConfig) => {
        const sc = scRef.current;
        if (!sc) return;
        await sc.agent.setAgentConfig(cfg);
    }, []);

    const removeAgentConfig = useCallback(async () => {
        const sc = scRef.current;
        if (!sc) return;
        await sc.agent.removeAgentConfig();
    }, []);

    return { config, status, presets, isLoading, error, reload, setAgentConfig, removeAgentConfig };
}

// ── useChatList ─────────────────────────────────────────────────────────────

export function useChatList(deviceFingerprint: string | null) {
    const [chats, setChats] = useState<ChatInfo[]>([]);
    const chatInfoRef = useRef<SignalNodeRef<[ChatInfo], string> | null>(null);
    const scRef = useRef<ServiceController | null>(null);

    const load = useCallback(async (sc: ServiceController, shouldAbort: () => boolean) => {
        const list = await sc.agent.listChats();
        if (shouldAbort()) return;
        list.sort((a, b) => {
            const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return tb - ta;
        });
        setChats(list);
        scRef.current = sc;
    }, []);

    const setupSignals = useCallback((sc: ServiceController) => {
        chatInfoRef.current = sc.agent.chatInfoSignal.add((info: ChatInfo) => {
            setChats(prev => {
                const idx = prev.findIndex(c => c.chatId === info.chatId);
                let updated: ChatInfo[];
                if (idx >= 0) {
                    updated = [...prev];
                    updated[idx] = info;
                } else {
                    updated = [info, ...prev];
                }
                return updated.sort((a, b) => {
                    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                    return tb - ta;
                });
            });
        });
    }, []);

    const clearSignals = useCallback((sc: ServiceController) => {
        if (chatInfoRef.current) {
            sc.agent.chatInfoSignal.detach(chatInfoRef.current);
            chatInfoRef.current = null;
        }
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
    });

    const newChat = useCallback(async (cwd?: string) => {
        const sc = scRef.current;
        if (!sc) throw new Error('Not initialized');
        const chat = await sc.agent.newChat(cwd);
        setChats(prev => [chat, ...prev]);
        return chat;
    }, []);

    return { chats, isLoading, error, reload, newChat };
}

// ── useChat ─────────────────────────────────────────────────────────────────

function applyStreamUpdate(msg: AgentMessage, update: AgentChatUpdate): AgentMessage {
    const next = { ...msg, content: [...msg.content], thoughts: msg.thoughts ? [...msg.thoughts] : undefined, toolCalls: msg.toolCalls ? [...msg.toolCalls] : undefined };
    switch (update.kind) {
        case 'agent_message_chunk':
            next.content.push(update.content);
            break;
        case 'agent_thought_chunk':
            if (!next.thoughts) next.thoughts = [];
            next.thoughts.push(update.content);
            break;
        case 'tool_call': {
            if (!next.toolCalls) next.toolCalls = [];
            const { kind: _, ...tc } = update;
            next.toolCalls.push(tc);
            break;
        }
        case 'tool_call_update': {
            if (!next.toolCalls) next.toolCalls = [];
            const { kind: _, ...tcUpdate } = update;
            const idx = next.toolCalls.findIndex(t => t.toolCallId === tcUpdate.toolCallId);
            if (idx >= 0) next.toolCalls[idx] = { ...next.toolCalls[idx], ...tcUpdate };
            else next.toolCalls.push(tcUpdate);
            break;
        }
        case 'plan':
            next.plan = update.entries;
            break;
    }
    return next;
}

export function useChat(deviceFingerprint: string | null, chatId: string | null) {
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
    const [status, setStatus] = useState<ChatStatus>('idle');
    const [pendingPermission, setPendingPermission] = useState<AgentPermissionRequest | null>(null);
    const [configOptions, setConfigOptions] = useState<ChatConfigOption[]>([]);
    const scRef = useRef<ServiceController | null>(null);
    const chatIdRef = useRef<string | null>(chatId);
    const chatInfoRef = useRef<SignalNodeRef<[ChatInfo], string> | null>(null);
    const streamRef = useRef<SignalNodeRef<[string, AgentChatUpdate], string> | null>(null);
    const streamingRef = useRef<AgentMessage | null>(null);

    // Keep chatIdRef in sync for stable callbacks
    chatIdRef.current = chatId;

    // Auto-mark as read when chat is open and new unread arrives
    useEffect(() => {
        if (chatInfo?.isUnread && chatInfo.status !== 'asking' && scRef.current) {
            scRef.current.agent.markRead(chatInfo.chatId).catch(() => { });
        }
    }, [chatInfo?.isUnread, chatInfo?.chatId, chatInfo?.status]);

    const load = useCallback(async (sc: ServiceController, shouldAbort: () => boolean) => {
        scRef.current = sc;
        if (!chatId) {
            setMessages([]);
            setChatInfo(null);
            setStatus('idle');
            setConfigOptions([]);
            setPendingPermission(null);
            return;
        }
        const [info, msgs, config] = await Promise.all([
            sc.agent.getChat(chatId),
            sc.agent.getChatMessages(chatId),
            sc.agent.getChatConfig(chatId).catch(() => [] as ChatConfigOption[]),
        ]);
        if (shouldAbort()) return;
        setChatInfo(info);
        setMessages(msgs);
        setStatus(info?.status ?? 'idle');
        setPendingPermission(info?.pendingPermission ?? null);
        setConfigOptions(config);
    }, [chatId]);

    const setupSignals = useCallback((sc: ServiceController) => {
        chatInfoRef.current = sc.agent.chatInfoSignal.add((info: ChatInfo) => {
            if (info.chatId !== chatIdRef.current) return;
            setChatInfo(info);
            setStatus(info.status);
            if (info.pendingPermission) {
                setPendingPermission(info.pendingPermission);
            } else if (info.status !== 'asking') {
                setPendingPermission(null);
            }
            if (info.status === 'idle') {
                streamingRef.current = null;
                sc.agent.getChatMessages(info.chatId).then(msgs => {
                    if (chatIdRef.current === info.chatId) setMessages(msgs);
                }).catch(() => { });
            }
        });
        streamRef.current = sc.agent.messageStreamSignal.add((id: string, update: AgentChatUpdate) => {
            if (id !== chatIdRef.current) return;
            if (update.kind === 'chat_info_update') return;
            if (!streamingRef.current) {
                streamingRef.current = { role: 'assistant', content: [] };
            }
            streamingRef.current = applyStreamUpdate(streamingRef.current, update);
            const streaming = streamingRef.current;
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last && last === streamingRef.current) return prev;
                if (last?.role === 'assistant' && !last.stopReason) {
                    return [...prev.slice(0, -1), streaming];
                }
                return [...prev, streaming];
            });
        });
    }, []);

    const clearSignals = useCallback((sc: ServiceController) => {
        if (chatInfoRef.current) { sc.agent.chatInfoSignal.detach(chatInfoRef.current); chatInfoRef.current = null; }
        if (streamRef.current) { sc.agent.messageStreamSignal.detach(streamRef.current); streamRef.current = null; }
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
        resourceKey: chatId ?? undefined,
    });

    const sendMessage = useCallback(async (text: string) => {
        const sc = scRef.current;
        const id = chatIdRef.current;
        if (!sc || !id) return;
        streamingRef.current = null;
        const userMsg: AgentMessage = { role: 'user', content: [{ type: 'text', text }] };
        setMessages(prev => [...prev, userMsg]);
        try {
            await sc.agent.sendMessage(id, text);
            const msgs = await sc.agent.getChatMessages(id);
            if (chatIdRef.current === id) setMessages(msgs);
        } catch (err: any) {
            console.error('[useChat] sendMessage failed:', err);
        }
    }, []);

    const sendMessageWithContent = useCallback(async (content: AgentContentBlock[]) => {
        const sc = scRef.current;
        const id = chatIdRef.current;
        if (!sc || !id) return;
        streamingRef.current = null;
        const userMsg: AgentMessage = { role: 'user', content };
        setMessages(prev => [...prev, userMsg]);
        try {
            await sc.agent.sendMessageWithContent(id, content);
            const msgs = await sc.agent.getChatMessages(id);
            if (chatIdRef.current === id) setMessages(msgs);
        } catch (err: any) {
            console.error('[useChat] sendMessageWithContent failed:', err);
        }
    }, []);

    const cancelMessage = useCallback(async () => {
        const sc = scRef.current;
        const id = chatIdRef.current;
        if (!sc || !id) return;
        await sc.agent.cancelMessage(id);
    }, []);

    const respondToPermission = useCallback(async (optionId: string) => {
        const sc = scRef.current;
        const id = chatIdRef.current;
        if (!sc || !id) return;
        await sc.agent.respondToPermission(id, optionId);
        setPendingPermission(null);
    }, []);

    const setChatConfig = useCallback(async (key: string, value: string) => {
        const sc = scRef.current;
        const id = chatIdRef.current;
        if (!sc || !id) return;
        await sc.agent.setChatConfig(id, key, value);
        const updated = await sc.agent.getChatConfig(id);
        if (chatIdRef.current === id) setConfigOptions(updated);
    }, []);

    return {
        chatInfo, messages, status, isLoading, error, reload,
        pendingPermission, configOptions,
        sendMessage, sendMessageWithContent, cancelMessage,
        respondToPermission, setChatConfig,
    };
}
