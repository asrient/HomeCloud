import { useCallback, useRef, useState } from 'react';
import {
    AgentConfig, AgentStatus, ChatInfo, ChatStatus, AgentMessage,
    AgentChatUpdate, AgentPermissionRequest, ChatConfigOption, AgentContentBlock,
} from 'shared/types';
import ServiceController from 'shared/controller';
import { SignalNodeRef } from 'shared/signals';
import { useResource } from './useResource';

// ── useAgentConfig ──────────────────────────────────────────────────────────

export function useAgentConfig(deviceFingerprint: string | null) {
    const [config, setConfig] = useState<AgentConfig | null>(null);
    const [status, setStatus] = useState<AgentStatus>({ connectionStatus: 'disconnected' });
    const [presets, setPresets] = useState<AgentConfig[]>([]);
    const statusRef = useRef<SignalNodeRef<[AgentStatus], string> | null>(null);
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
        statusRef.current = sc.agent.statusSignal.add((s) => setStatus(s));
    }, []);

    const clearSignals = useCallback((sc: ServiceController) => {
        if (statusRef.current) {
            sc.agent.statusSignal.detach(statusRef.current);
            statusRef.current = null;
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
        setConfig(cfg);
    }, []);

    const removeAgentConfig = useCallback(async () => {
        const sc = scRef.current;
        if (!sc) return;
        await sc.agent.removeAgentConfig();
        setConfig(null);
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
        setChats(list);
        scRef.current = sc;
    }, []);

    const setupSignals = useCallback((sc: ServiceController) => {
        chatInfoRef.current = sc.agent.chatInfoSignal.add((info: ChatInfo) => {
            setChats(prev => {
                const idx = prev.findIndex(c => c.chatId === info.chatId);
                if (idx >= 0) {
                    const updated = [...prev];
                    updated[idx] = info;
                    return updated;
                }
                return [info, ...prev];
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

export function useChat(deviceFingerprint: string | null, chatId: string | null) {
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
    const [status, setStatus] = useState<ChatStatus>('idle');
    const [pendingPermission, setPendingPermission] = useState<AgentPermissionRequest | null>(null);
    const [configOptions, setConfigOptions] = useState<ChatConfigOption[]>([]);
    const scRef = useRef<ServiceController | null>(null);
    const chatIdRef = useRef<string | null>(chatId);
    const chatInfoRef = useRef<SignalNodeRef<[ChatInfo], string> | null>(null);
    const permRef = useRef<SignalNodeRef<[AgentPermissionRequest], string> | null>(null);
    const streamRef = useRef<SignalNodeRef<[string, AgentChatUpdate], string> | null>(null);

    // Keep chatIdRef in sync for stable callbacks
    chatIdRef.current = chatId;

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
        setConfigOptions(config);
    }, [chatId]);

    const setupSignals = useCallback((sc: ServiceController) => {
        chatInfoRef.current = sc.agent.chatInfoSignal.add((info: ChatInfo) => {
            if (info.chatId !== chatIdRef.current) return;
            setChatInfo(info);
            setStatus(info.status);
            if (info.status === 'idle') {
                sc.agent.getChatMessages(info.chatId).then(msgs => {
                    if (chatIdRef.current === info.chatId) setMessages(msgs);
                }).catch(() => { });
            }
        });
        permRef.current = sc.agent.permissionRequestSignal.add((req: AgentPermissionRequest) => {
            if (req.chatId !== chatIdRef.current) return;
            setPendingPermission(req);
        });
        streamRef.current = sc.agent.messageStreamSignal.add((_id: string, _update: AgentChatUpdate) => {
            // Service accumulates; we refresh on chatInfo → idle.
        });
    }, []);

    const clearSignals = useCallback((sc: ServiceController) => {
        if (chatInfoRef.current) { sc.agent.chatInfoSignal.detach(chatInfoRef.current); chatInfoRef.current = null; }
        if (permRef.current) { sc.agent.permissionRequestSignal.detach(permRef.current); permRef.current = null; }
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
