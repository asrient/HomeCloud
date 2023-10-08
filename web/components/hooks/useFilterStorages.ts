import { useMemo } from "react";
import { useAppState } from "./useAppState";
import { AppName, Storage } from "@/lib/types";

function isAppEnabled(appName: AppName, storage: Storage) {
    switch (appName) {
        case AppName.Photos:
            return !!storage.storageMeta?.isPhotosEnabled;
        case AppName.Files:
            return true;
        case AppName.Notes:
            return false;
        default:
            return false;
    }
}

export default function useFilterStorages(appName: AppName) {
    const { storages, disabledStorages } = useAppState();
    const filteredStorages = useMemo(() => {
        if (!storages) {
            return [];
        }
        return storages.filter((storage) => !disabledStorages.includes(storage.id) && isAppEnabled(appName, storage));
    }, [storages, disabledStorages, appName]);
    return filteredStorages;
}
