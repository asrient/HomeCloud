import { Photo, PhotoView, PhotosFetchOptions } from "@/lib/types";
import { Dispatch, SetStateAction, useCallback, useEffect } from "react";;
import { mergePhotosList, sortPhotos } from "@/lib/photoUtils";

type PhotosDelta = {
    add: Photo[];
    update: { [itemId: number]: Photo };
    delete: number[];
}

export type UsePhotosParams = {
    setPhotos: Dispatch<SetStateAction<PhotoView[]>>,
    fetchOptions: PhotosFetchOptions,
    setHasMore: Dispatch<SetStateAction<{
        [key: number]: boolean;
    }>>,
}

export default function usePhotosUpdates({ setPhotos, fetchOptions, setHasMore }: UsePhotosParams) {

    const applyUpdates = useCallback((updates: PhotosDelta, storageId: number) => {
        const sortKey = fetchOptions.sortBy;
        const { add, update, delete: del } = updates;
        const newPhotos: PhotoView[] = add.map((photo) => ({
            ...photo,
            isSelected: false,
            storageId,
        }));
        const newPhotosSorted = sortPhotos(newPhotos, sortKey, fetchOptions.ascending ?? true);
        const updateSet = new Set(Object.keys(update).map(Number));
        const delSet = new Set(del);
        setPhotos((prev) => {
            const updated = prev.map((photo) => {
                if (updateSet.has(photo.itemId) && photo.storageId === storageId) {
                    return {
                        ...photo,
                        ...update[photo.itemId],
                    }
                }
                return photo;
            });
            const deleted = updated.filter((photo) => !delSet.has(photo.itemId) && photo.storageId === storageId);
            if (deleted.length === 0) {
                return newPhotosSorted;
            }
            const { merged } = mergePhotosList([newPhotosSorted, deleted], sortKey, fetchOptions.ascending ?? true, deleted[deleted.length - 1]);
            if (merged.length !== (newPhotosSorted.length + deleted.length)) {
                console.log("some photos were lost during merge, setting hasMore as true");
                setHasMore((prev) => ({ ...prev, [storageId]: true }));
            }
            return merged;
        });
    }, [fetchOptions.ascending, fetchOptions.sortBy, setHasMore, setPhotos]);
    return { applyUpdates };
}
