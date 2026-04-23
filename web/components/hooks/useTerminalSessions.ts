import { useCallback, useRef, useState } from 'react';
import { TerminalSessionEntry } from 'shared/types';
import ServiceController from 'shared/controller';
import { SignalNodeRef } from 'shared/signals';
import { useResource } from './useResource';
import { getServiceController, isMethodAvailable } from '@/lib/utils';
import { SignalEvent } from '@/lib/enums';

export function useTerminalSessions(deviceFingerprint: string | null) {
    const [sessions, setSessions] = useState<TerminalSessionEntry[]>([]);
    const [isSessionsSupported, setIsSessionsSupported] = useState(false);
    const signalRef = useRef<SignalNodeRef<[SignalEvent, TerminalSessionEntry], string> | null>(null);

    const load = useCallback(async (sc: ServiceController, shouldAbort: () => boolean) => {
        const v2 = await isMethodAvailable(sc, 'terminal.listTerminalSessions');
        if (shouldAbort()) return;
        setIsSessionsSupported(v2);
        if (!v2) {
            setSessions([]);
            return;
        }
        const list = await sc.terminal.listTerminalSessions();
        if (shouldAbort()) return;
        setSessions(list);
    }, []);

    const setupSignals = useCallback(async (sc: ServiceController) => {
        const v2 = await isMethodAvailable(sc, 'terminal.listTerminalSessions');
        if (!v2) return;
        signalRef.current = sc.terminal.terminalSessionSignal.add((event: SignalEvent, entry: TerminalSessionEntry) => {
            switch (event) {
                case SignalEvent.ADD:
                    setSessions(prev => {
                        if (prev.some(s => s.sessionId === entry.sessionId)) return prev;
                        return [entry, ...prev];
                    });
                    break;
                case SignalEvent.UPDATE:
                    setSessions(prev => prev.map(s => s.sessionId === entry.sessionId ? entry : s));
                    break;
                case SignalEvent.REMOVE:
                    setSessions(prev => prev.filter(s => s.sessionId !== entry.sessionId));
                    break;
            }
        });
    }, []);

    const clearSignals = useCallback((sc: ServiceController) => {
        if (signalRef.current) {
            sc.terminal.terminalSessionSignal.detach(signalRef.current);
            signalRef.current = null;
        }
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
    });

    const createSession = useCallback(async (shell?: string) => {
        if (!isSessionsSupported) throw new Error('Sessions not supported');
        const sc = await getServiceController(deviceFingerprint);
        const entry = await sc.terminal.startTerminalSessionV2(shell, true);
        setSessions(prev => {
            if (prev.some(s => s.sessionId === entry.sessionId)) return prev;
            return [entry, ...prev];
        });
        return entry;
    }, [deviceFingerprint, isSessionsSupported]);

    const killSession = useCallback(async (sessionId: string) => {
        if (!isSessionsSupported) throw new Error('Sessions not supported');
        const sc = await getServiceController(deviceFingerprint);
        await sc.terminal.stopTerminalSession(sessionId);
        setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
    }, [deviceFingerprint, isSessionsSupported]);

    return { sessions, isLoading, error, reload, createSession, killSession, isSessionsSupported };
}
