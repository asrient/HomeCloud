import { Photo, PhotoView, PhotosFetchOptions } from "@/lib/types";
import { onEvent } from "@/lib/api/events";
import { Dispatch, SetStateAction, useCallback, useEffect } from "react";
import { useAppState } from "./useAppState";

type PhotosDelta = {
    lastSyncTime: number;
    updates: {
        add: { [itemId: number]: Photo };
        update: { [itemId: number]: Photo };
        delete: number[];
    }
}

export type UsePhotosParams = {
    setPhotos: Dispatch<SetStateAction<PhotoView[]>>,
    setHasMore: (hasMore: boolean) => void,
    fetchOptions: PhotosFetchOptions,
}

function filterPhotos(photos: Photo[], fetchOptions: PhotosFetchOptions) {
    return photos.filter((photo) => fetchOptions.storageIds.includes(photo.storageId));
}

function mapToArray(photos: { [itemId: number]: Photo }) {
    return Object.keys(photos).map((itemId) => photos[Number(itemId)]);
}

export default function usePhotosEvents({ setPhotos, setHasMore, fetchOptions }: UsePhotosParams) {
    const { isInitalized, isAppLoaded } = useAppState();

    // only supports date sort (descending) for now
    const applyUpdates = useCallback((updates: PhotosDelta) => {
        if (!['capturedOn', 'addedOn'].includes(fetchOptions.sortBy)) return;
        if (fetchOptions.ascending) return;
        const sortKey = fetchOptions.sortBy;
        const { lastSyncTime, updates: { add, update, delete: del } } = updates;
        const newPhotos: PhotoView[] = [];
        const updateSet = new Set(Object.keys(update).map(Number));
        const addList = filterPhotos(mapToArray(add), fetchOptions).sort((a, b) => {
            const dateA = new Date(a[sortKey]).getTime();
            const dateB = new Date(b[sortKey]).getTime();
            return dateB - dateA;
        });
        const delSet = new Set(del);
        let addIndex = 0;
        setPhotos((photos) => {
            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];
                if (delSet.has(photo.itemId)) {
                    continue;
                }

                while (addList.length && addIndex < addList.length && new Date(addList[addIndex][sortKey]).getTime() >= new Date(photo[sortKey]).getTime()) {
                    newPhotos.push({
                        ...addList[addIndex],
                        isSelected: false,
                    });
                    addIndex++;
                }

                if (updateSet.has(photo.itemId)) {
                    const updatedPhoto = update[photo.itemId];
                    newPhotos.push({
                        ...photo,
                        ...updatedPhoto,
                    });
                    continue;
                }

                newPhotos.push(photo);
            }

            if (addList.length && addIndex < addList.length) {
                console.warn('Some photos.add updates were not applied due to pagination:', addList.slice(addIndex));
                setHasMore(true);
            }

            return newPhotos;
        });

    }, [fetchOptions, setHasMore, setPhotos]);

    useEffect(() => {
        if (!isInitalized || !isAppLoaded) return;
        return onEvent('photos.delta', (data: any) => {
            console.log('photos.delta', data);
            applyUpdates(data);
        });
    }, [isInitalized, isAppLoaded, applyUpdates]);
}
