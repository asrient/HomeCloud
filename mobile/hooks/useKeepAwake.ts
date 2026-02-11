import { useEffect } from 'react';
import { deactivateKeepAwake, activateKeepAwakeAsync } from 'expo-keep-awake';
import { create } from 'zustand';

const KEEP_AWAKE_TAG = 'app-keep-awake';

interface KeepAwakeState {
    enabled: boolean;
    setEnabled: (enabled: boolean) => void;
    toggle: () => void;
}

export const useKeepAwakeStore = create<KeepAwakeState>((set, get) => ({
    enabled: true,
    setEnabled: (enabled: boolean) => {
        set({ enabled });
        if (enabled) {
            activateKeepAwakeAsync(KEEP_AWAKE_TAG);
        } else {
            deactivateKeepAwake(KEEP_AWAKE_TAG);
        }
    },
    toggle: () => {
        get().setEnabled(!get().enabled);
    },
}));

/**
 * Call this in the root layout to activate keep-awake by default.
 * Other components can use `useKeepAwakeStore` to read/toggle the state:
 *
 * ```ts
 * const { enabled, setEnabled, toggle } = useKeepAwakeStore();
 * ```
 */
export function useKeepAwakeControl() {
    const enabled = useKeepAwakeStore((s) => s.enabled);

    useEffect(() => {
        if (enabled) {
            activateKeepAwakeAsync(KEEP_AWAKE_TAG);
        } else {
            deactivateKeepAwake(KEEP_AWAKE_TAG);
        }
        return () => {
            deactivateKeepAwake(KEEP_AWAKE_TAG);
        };
    }, [enabled]);
}
