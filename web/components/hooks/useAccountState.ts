import { useCallback, useRef } from 'react'
import { SignalNodeRef } from 'shared/signals'
import { create } from 'zustand'
import { useAppDispatch } from './useAppState'
import { ActionTypes } from '@/lib/state'

interface AccountState {
    isLinked: boolean
    accountEmail: string | null
    serverConnected: boolean
    accountLinked: (email: string | null) => void
    accountUnlinked: () => void
    setServerConnected: (connected: boolean) => void
}

export const useAccountStore = create<AccountState>((set) => ({
    isLinked: false,
    accountEmail: null,
    serverConnected: false,
    accountLinked: (email: string | null) => set(() => ({
        isLinked: true,
        accountEmail: email,
    })),
    accountUnlinked: () => set(() => ({
        isLinked: false,
        accountEmail: null,
        serverConnected: false,
    })),
    setServerConnected: (connected: boolean) => set(() => ({
        serverConnected: connected,
    })),
}))

export function useAccountState() {
    const { isLinked, accountEmail, serverConnected, accountLinked, accountUnlinked, setServerConnected } = useAccountStore();
    const linkSignalRef = useRef<SignalNodeRef<[boolean], string> | null>(null);
    const connectionSignalRef = useRef<SignalNodeRef<[boolean], string> | null>(null);
    const dispatch = useAppDispatch();

    const setupAccountState = useCallback(() => {
        const localSc = window.modules.getLocalServiceController();
        // Initialize state
        const linked = localSc.account.isLinked();
        const email = localSc.account.getAccountEmail();
        if (linked) {
            accountLinked(email);
        } else {
            accountUnlinked();
        }
        const connected = localSc.account.isServerConnected();
        setServerConnected(connected);

        // Setup signals
        linkSignalRef.current = localSc.account.accountLinkSignal.add((linked: boolean) => {
            if (linked) {
                const email = localSc.account.getAccountEmail();
                accountLinked(email);
                // Re-fetch peers and connections after linking
                const peers = localSc.app.getPeers();
                const connections = localSc.net.getConnectedDevices();
                dispatch(ActionTypes.REFRESH_PEERS, { peers, connections });
            } else {
                accountUnlinked();
                dispatch(ActionTypes.RESET_PEERS, null);
            }
        });

        connectionSignalRef.current = localSc.account.websocketConnectionSignal.add((connected: boolean) => {
            setServerConnected(connected);
        });

    }, [accountLinked, accountUnlinked, dispatch, setServerConnected]);

    const clearAccountState = useCallback(() => {
        const localSc = window.modules.getLocalServiceController();
        if (linkSignalRef.current) {
            localSc.account.accountLinkSignal.detach(linkSignalRef.current);
            linkSignalRef.current = null;
        }
        if (connectionSignalRef.current) {
            localSc.account.websocketConnectionSignal.detach(connectionSignalRef.current);
            connectionSignalRef.current = null;
        }
    }, []);

    return {
        isLinked,
        accountEmail,
        serverConnected,
        setupAccountState,
        clearAccountState,
    };
}
