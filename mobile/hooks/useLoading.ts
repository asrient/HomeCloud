import { useCallback } from "react";
import { create } from 'zustand';

interface LoadingEntry {
    id: string;
    title?: string;
    canCancel: boolean;
    onCancel?: () => void;
}

interface LoadingState {
    entries: LoadingEntry[];
    addEntry: (entry: LoadingEntry) => void;
    removeEntry: (id: string) => void;
}

let _nextId = 0;
function generateId(): string {
    return `loading_${++_nextId}`;
}

export const useLoadingStore = create<LoadingState>((set) => ({
    entries: [],
    addEntry: (entry) => set((state) => ({
        entries: [...state.entries, entry],
    })),
    removeEntry: (id) => set((state) => ({
        entries: state.entries.filter((e) => e.id !== id),
    })),
}));

export function useLoading() {
    const { entries, addEntry, removeEntry } = useLoadingStore();

    // The topmost (most recent) entry drives the modal display
    const current = entries.length > 0 ? entries[entries.length - 1] : null;

    const showLoading = useCallback((options?: {
        title?: string;
        canCancel?: boolean;
        onCancel?: () => void;
    }): string => {
        const id = generateId();
        addEntry({
            id,
            title: options?.title,
            canCancel: options?.canCancel ?? false,
            onCancel: options?.onCancel,
        });
        return id;
    }, [addEntry]);

    const hideLoading = useCallback((id: string) => {
        removeEntry(id);
    }, [removeEntry]);

    return {
        isActive: entries.length > 0,
        title: current?.title,
        canCancel: current?.canCancel ?? false,
        onCancel: current?.onCancel,
        showLoading,
        hideLoading,
    };
}
