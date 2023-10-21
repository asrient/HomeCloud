import { Photo, PhotoView } from "@/lib/types";
import { onEvent } from "@/lib/api/events";
import { useCallback, useEffect } from "react";
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
    photos: PhotoView[],
    setPhotos: (photos: PhotoView[]) => void,
    setHasMore: (hasMore: boolean) => void,
    sortKey: 'capturedOn' | 'addedOn' | null
}

export default function usePhotosEvents({ photos, setPhotos, setHasMore, sortKey }: UsePhotosParams) {
    const { isInitalized, isAppLoaded } = useAppState();

    // only supports date sort (descending) for now
    const applyUpdates = useCallback((updates: PhotosDelta) => {
        if (!sortKey) return;
        const { lastSyncTime, updates: { add, update, delete: del } } = updates;
        const newPhotos: PhotoView[] = [];
        const updateSet = new Set(Object.keys(update).map(Number));
        const addIds = Object.keys(add).map(Number).sort((a, b) => {
            const dateA = new Date(add[a][sortKey]).getTime();
            const dateB = new Date(add[b][sortKey]).getTime();
            return dateB - dateA;
        });
        const delSet = new Set(del);
        let addIndex = 0;
        for (let i = 0; i < photos.length; i++) {
            const photo = photos[i];
            if (delSet.has(photo.itemId)) {
                continue;
            }

            while (addIds.length && addIndex < addIds.length && new Date(add[addIds[addIndex]][sortKey]).getTime() >= new Date(photo[sortKey]).getTime()) {
                newPhotos.push({
                    ...add[addIds[addIndex]],
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

        if (addIds.length && addIndex < addIds.length) {
            console.warn('Some photos.add updates were not applied due to pagination:', addIds.slice(addIndex));
            setHasMore(true);
        }

        setPhotos(newPhotos);
    }, [photos, setHasMore, setPhotos, sortKey]);

    useEffect(() => {
        if (!isInitalized || !isAppLoaded) return;
        return onEvent('photos.delta', (data: any) => {
            console.log('photos.delta', data);
            applyUpdates(data);
        });
    }, [isInitalized, isAppLoaded, applyUpdates]);
}
