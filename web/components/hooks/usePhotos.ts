import { useCallback, useEffect, useRef, useState } from "react";
import ServiceController from "shared/controller";
import { useResource } from "./useResource";
import { PhotoLibraryLocation } from "shared/types";
import { PhotosFetchOptions, PhotoView } from "@/lib/types";
import { getServiceController } from "@/lib/utils";
import { libraryHashFromId } from "@/lib/photoUtils";

export const usePhotoLibraries = (deviceFingerprint: string | null) => {
    const [photoLibraries, setPhotoLibraries] = useState<PhotoLibraryLocation[]>([]);

    const load = useCallback(async (serviceController: ServiceController) => {
        const libs = await serviceController.photos.getLocations();
        setPhotoLibraries(libs);
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
    });

    return {
        photoLibraries,
        isLoading,
        error,
        reload,
    }
}

export const usePhotoLibrary = (deviceFingerprint: string | null, libraryId: string) => {
    const [photoLibrary, setPhotoLibrary] = useState<PhotoLibraryLocation | null>(null);

    const load = useCallback(async (serviceController: ServiceController) => {
        const lib = await serviceController.photos.getLocation(libraryId);
        setPhotoLibrary(lib);
    }, [libraryId]);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
    });

    return {
        photoLibrary,
        isLoading,
        error,
        reload,
    }
}

const FETCH_LIMIT = 50;

export const usePhotos = (fetchOpts: PhotosFetchOptions) => {
    const [photos, setPhotos] = useState<PhotoView[]>([]);
    const [hasMore, setHasMore] = useState<boolean>(true);
    const nextCursorRef = useRef<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const isLoadingRef = useRef(isLoading);
    const [error, setError] = useState<string | null>(null);
    const currentLibHashRef = useRef<string | null>(null);

    const reset = useCallback(() => {
        nextCursorRef.current = null;
        setPhotos([]);
        setHasMore(true);
        setIsLoading(false);
        isLoadingRef.current = false;
        setError(null);
        currentLibHashRef.current = null;
    }, []);

    const load = useCallback(async () => {
        if (isLoadingRef.current) {
            console.warn("Load called while already loading");
            return;
        }
        setIsLoading(true);
        isLoadingRef.current = true;
        try {
            const serviceController = await getServiceController(fetchOpts.deviceFingerprint);
            const photosResp = await serviceController.photos.getPhotos(fetchOpts.library.id, {
                limit: FETCH_LIMIT,
                cursor: nextCursorRef.current,
                sortBy: fetchOpts.sortBy,
                ascending: fetchOpts.ascending ?? true,
            });

            const photoViews: PhotoView[] = photosResp.photos.map(photo => ({
                ...photo,
                libraryId: fetchOpts.library.id,
                deviceFingerprint: fetchOpts.deviceFingerprint,
                isSelected: false,
            }));

            setPhotos(prev => {
                return [...prev, ...photoViews];
            });
            nextCursorRef.current = photosResp.nextCursor;
            setHasMore(photosResp.hasMore ?? photosResp.photos.length === FETCH_LIMIT);
            setError(null);
        } catch (err: any) {
            console.error("Failed to load photos:", err);
            setError(err.message || "Failed to load photos");
        } finally {
            setIsLoading(false);
            isLoadingRef.current = false;
        }
    }, [fetchOpts]);

    // Load for the first time or whenever the library or device fingerprint changes
    useEffect(() => {
        if (isLoadingRef.current) {
            return;
        }
        const hash = libraryHashFromId(fetchOpts.deviceFingerprint, fetchOpts.library.id);
        if (currentLibHashRef.current === hash) {
            return;
        }
        console.log("Loading photos for library:", fetchOpts.library.id, "with hash:", hash);
        currentLibHashRef.current = hash;
        reset();
        load();
    }, [fetchOpts.deviceFingerprint, fetchOpts.library.id, load, reset]);

    return {
        photos,
        setPhotos,
        hasMore,
        isLoading,
        error,
        load,
    }
}
