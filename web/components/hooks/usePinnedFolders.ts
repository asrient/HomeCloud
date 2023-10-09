import { AppName, PinnedFolder, Storage } from "@/lib/types";
import useFilterStorages from "./useFilterStorages";
import { useRouter } from "next/router";
import { useAppState, useAppDispatch } from "./useAppState";
import { useEffect, useState } from "react";
import { ActionTypes } from "@/lib/state";
import { listPins } from "@/lib/api/files";

export default function usePinnedFolders() {
    const dispatch = useAppDispatch();
    const router = useRouter();
    const pathname = router.pathname;
    const storages = useFilterStorages(AppName.Files);
    const { pinnedFolders } = useAppState();

    const [checkedStorageIds, setCheckedStorageIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    useEffect(() => {
        async function refresh() {
            const storageIds = (storages.map((storage) => storage.id)).sort();
            if (storageIds.length !== checkedStorageIds.length || storageIds.some((id, index) => id !== checkedStorageIds[index])) {
                // console.log('usePinnedFolders: storageIds changed', storageIds, checkedStorageIds);
                setIsLoading(true);
                setCheckedStorageIds(storageIds);
                try {
                    const pinnedFoldersResp = await listPins({
                        storageIds,
                    });
                    dispatch(ActionTypes.SET_PINNED_FOLDERS, { pins: pinnedFoldersResp.pins });
                } catch (error) {
                    console.error('listPins error:', error);
                } finally {
                    setIsLoading(false);
                }
            }
        }
        if (pathname.split('/')[1] !== 'files') {
            return;
        }
        if (!storages || isLoading) return;
        refresh();
    }, [pinnedFolders, storages, pathname, checkedStorageIds, isLoading, dispatch]);
}
