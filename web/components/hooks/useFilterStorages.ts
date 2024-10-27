import { useMemo } from "react";
import { useAppState } from "./useAppState";
import { AppName, Storage } from "@/lib/types";
import { isAppAllowed } from "@/lib/storageConfig";

function isAppEnabled(appName: AppName, storage: Storage) {
    return isAppAllowed(storage.type, appName);
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
