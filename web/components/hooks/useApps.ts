import { useCallback, useEffect, useRef, useState } from 'react';
import { useResource } from './useResource';
import { RemoteAppInfo } from 'shared/types';
import ServiceController from 'shared/controller';
import { getServiceController } from '@/lib/utils';

export const useRunningApps = (
    deviceFingerprint: string | null,
) => {
    const [runningApps, setRunningApps] = useState<RemoteAppInfo[]>([]);

    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        const running = await serviceController.apps.getRunningApps();
        if (shouldAbort()) return;
        // Dedup by app id — native may return multiple processes with the same bundle ID
        const seen = new Set<string>();
        setRunningApps(running.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; }));
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
    });

    return { runningApps, isLoading, error, reload };
};

export const useInstalledApps = (deviceFingerprint: string | null) => {
    const [installedApps, setInstalledApps] = useState<RemoteAppInfo[]>([]);
    const forceRef = useRef(false);

    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        const installed = await serviceController.apps.getInstalledApps(forceRef.current);
        forceRef.current = false;
        if (shouldAbort()) return;
        setInstalledApps(installed);
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
    });

    const forceReload = useCallback(() => {
        forceRef.current = true;
        reload();
    }, [reload]);

    return { installedApps, isLoading, error, reload: forceReload };
};

export const useAppsAvailable = (deviceFingerprint: string | null) => {
    const [available, setAvailable] = useState<boolean | null>(null);

    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        const result = await serviceController.apps.isAvailable();
        if (shouldAbort()) return;
        setAvailable(result);
    }, []);

    const { isLoading } = useResource({ deviceFingerprint, load });

    return { available, isLoading };
};

export const useAppIcon = (appId: string, deviceFingerprint: string | null) => {
    const [iconUri, setIconUri] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setIconUri(null);
        getServiceController(deviceFingerprint).then(sc =>
            sc.apps.getAppIcon(appId)
        ).then(uri => {
            if (!cancelled) setIconUri(uri);
        }).catch(err => {
            console.error('Error fetching app icon:', err);
        });
        return () => { cancelled = true; };
    }, [appId, deviceFingerprint]);

    return iconUri;
};
