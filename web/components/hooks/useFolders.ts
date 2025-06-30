import { useCallback, useEffect, useRef, useState } from "react";
import { PinnedFolder, RemoteItem } from "shared/types";
import { SignalNodeRef } from "shared/signals";
import ServiceController from "shared/services/controller";
import { useResource } from "./useResource";
import { SignalEvent } from "@/lib/enums";

export const usePinnedFolders = (deviceFingerprint: string | null) => {
    const [pinnedFolders, setPinnedFolders] = useState<PinnedFolder[]>([]);
    const signalRef = useRef<SignalNodeRef<[SignalEvent, PinnedFolder], string> | null>(null);

    const load = useCallback(async (serviceController: ServiceController) => {
        const pins = await serviceController.files.listPinnedFolders();
        setPinnedFolders(pins);
    }, []);

    const clearSignals = useCallback((serviceController: ServiceController) => {
        if (signalRef.current) {
            serviceController.files.pinnedFoldersSignal.detach(signalRef.current);
            signalRef.current = null;
        }
    }, []);

    const setupSignals = useCallback((serviceController: ServiceController) => {
        signalRef.current = serviceController.files.pinnedFoldersSignal.add((event: SignalEvent, folder: PinnedFolder) => {
            if (event === SignalEvent.ADD) {
                setPinnedFolders((prev) => [...prev, folder]);
            } else if (event === SignalEvent.REMOVE) {
                setPinnedFolders((prev) => prev.filter((f) => f.path !== folder.path));
            } else if (event === SignalEvent.UPDATE) {
                setPinnedFolders((prev) =>
                    prev.map((f) => (f.path === folder.path ? { ...f, ...folder } : f))
                );
            }
        });
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        clearSignals,
        setupSignals,
    });

    return {
        pinnedFolders,
        isLoading,
        error,
        reload,
    }
}

export function useFolder<T extends RemoteItem>(deviceFingerprint: string | null, path: string, mapFunction?: (item: RemoteItem) => T) {
    const [remoteItems, setRemoteItems] = useState<T[]>([]);

    const load = useCallback(async (serviceController: ServiceController) => {
        const items = await serviceController.files.fs.readDir(path);
        setRemoteItems(items.map(item => mapFunction ? mapFunction(item) : item as T));
    }, [path, mapFunction]);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
    });

    return {
        remoteItems,
        setRemoteItems,
        isLoading,
        error,
        reload,
    }
}

export function useStat(deviceFingerprint: string | null, path: string) {
    const [remoteItem, setRemoteItem] = useState<RemoteItem | null>(null);

    const load = useCallback(async (serviceController: ServiceController) => {
        const item = await serviceController.files.fs.getStat(path);
        setRemoteItem(item);
    }, [path]);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
    });

    return {
        remoteItem,
        setRemoteItem,
        isLoading,
        error,
        reload,
    }
}
