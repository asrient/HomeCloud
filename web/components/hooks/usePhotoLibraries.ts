import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "./useAppState";
import { AppName, PhotoLibrary } from "@/lib/types";
import { useToast } from "../ui/use-toast";
import { ActionTypes } from "@/lib/state";


const isFetching: { [key: number]: boolean } = {};

export const usePhotoLibrariesForStorage = () => {
    const dispatch = useAppDispatch();
    const { toast } = useToast();
    const loadLibraries = useCallback(async (storage: Storage) => {
        if (isFetching[storage.id]) {
            return;
        }
        isFetching[storage.id] = true;
        try {
            //const photoLibraries = await getLibraries(storage.id);
            //dispatch(ActionTypes.SET_PHOTO_LIBRARIES, { photoLibraries, storageId: storage.id });
        } catch (error: any) {
            console.error('Load Photos Library error:', storage.name, error);
            toast({
                type: 'foreground',
                title: `Could not get photo libraries for "${storage.name}"`,
                description: error.message,
                color: 'red',
            });
        } finally {
            isFetching[storage.id] = false;
        }
    }, [dispatch, toast]);
    return { loadLibraries };
};

export type Location = {
    libraryId: number;
    storageId: number;
}

export default function usePhotoLibraries(locations?: Location[]) {
    //const storages = useFilterStorages(AppName.Photos);
    //const { photoLibraries } = useAppState();
    const { loadLibraries } = usePhotoLibrariesForStorage();
    const [checkedStorageIds, setCheckedStorageIds] = useState<number[]>([]);

    useEffect(() => {
        // async function refresh() {
        //     const storageIds = (storages.map((storage) => storage.id));
        //     const deltaStorageIds = storageIds.filter((id) => !checkedStorageIds.includes(id));
        //     if (deltaStorageIds.length > 0) {
        //         console.log('usePhotoLibraries: storageIds changed, delta:', deltaStorageIds); // debug
        //         setCheckedStorageIds(storageIds);
        //         const promises = deltaStorageIds.map(async (storageId) => {
        //             const storage = storages.find((storage) => storage.id === storageId);
        //             const promises_: Promise<void>[] = [
        //                 loadLibraries(storage!),
        //             ];
        //             return Promise.allSettled(promises_);
        //         });
        //         await Promise.allSettled(promises);
        //     }
        // }
        // if (!storages) return;
        // refresh();
    }, [checkedStorageIds, loadLibraries]);

    const libraries = useMemo(() => {
        const list: PhotoLibrary[] = [];

        // storages.forEach((storage) => {
        //     let libs = photoLibraries[storage.id] || [];
        //     if (locations && locations.length > 0) {
        //         libs = libs.filter((lib) => locations.some((loc) => loc.libraryId === lib.id && loc.storageId === storage.id));
        //     }
        //     list.push(...libs);
        // });
        return list;
    }, []);

    return { libraries };
}
