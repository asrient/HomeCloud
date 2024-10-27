import { AppName, Storage } from "@/lib/types";
import useFilterStorages from "./useFilterStorages";
import { useRouter } from "next/router";
import { useAppState, useAppDispatch } from "./useAppState";
import { useCallback, useEffect, useState } from "react";
import { ActionTypes } from "@/lib/state";
import { listPins } from "@/lib/api/files";
import { useToast } from "../ui/use-toast";
import { readDir } from "@/lib/api/fs";

export const usePinsForStorage = () => {
    const dispatch = useAppDispatch();
    const { toast } = useToast();
    const loadPins = useCallback(async (storage: Storage) => {
        try {
            const { pins } = await listPins({ storageId: storage.id });
            dispatch(ActionTypes.SET_PINNED_FOLDERS, { pins, storageId: storage.id });
        } catch (error: any) {
            console.error('listPins error:', storage.name, error);
            toast({
                type: 'foreground',
                title: `Failed to load pins for "${storage.name}"`,
                description: error.message,
                color: 'red',
            });
        }
    }, [dispatch, toast]);
    return { loadPins };
};

const isFetchingDisks: { [key: number]: boolean } = {};

export const useDisksForStorage = () => {
    const dispatch = useAppDispatch();
    const { toast } = useToast();
    const loadDisks = useCallback(async (storage: Storage) => {
        if (isFetchingDisks[storage.id]) {
            return;
        }
        isFetchingDisks[storage.id] = true;
        try {
            const items = await readDir({ storageId: storage.id, id: '' });
            dispatch(ActionTypes.SET_DISKS, { items, storageId: storage.id });
        } catch (error: any) {
            console.error('load Disks error:', storage.name, error);
            toast({
                type: 'foreground',
                title: `Could not get Disks for "${storage.name}"`,
                description: error.message,
                color: 'red',
            });
        } finally {
            isFetchingDisks[storage.id] = false;
        }
    }, [dispatch, toast]);
    return { loadDisks };
};

export default function usePinnedFolders() {
    const router = useRouter();
    const pathname = router.pathname;
    const storages = useFilterStorages(AppName.Files);
    const { pinnedFolders } = useAppState();
    const { loadPins } = usePinsForStorage();
    const { loadDisks } = useDisksForStorage();

    const [checkedStorageIds, setCheckedStorageIds] = useState<number[]>([]);

    useEffect(() => {
        async function refresh() {
            const storageIds = (storages.map((storage) => storage.id));
            const deltaStorageIds = storageIds.filter((id) => !checkedStorageIds.includes(id));
            if (deltaStorageIds.length > 0) {
                console.log('usePinnedFolders: storageIds changed, delta:', deltaStorageIds); // debug
                setCheckedStorageIds(storageIds);
                const promises = deltaStorageIds.map(async (storageId) => {
                    const storage = storages.find((storage) => storage.id === storageId);
                    const promises_: Promise<void>[] = [
                        loadPins(storage!),
                        loadDisks(storage!),
                    ];
                    return Promise.allSettled(promises_);
                });
                await Promise.allSettled(promises);
            }
        }
        if (pathname.split('/')[1] !== 'files') {
            return;
        }
        if (!storages) return;
        refresh();
    }, [pinnedFolders, storages, pathname, checkedStorageIds, loadPins, loadDisks]);
}
