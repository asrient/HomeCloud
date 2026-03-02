import { useCallback, useRef, useState } from 'react';
import { useResource, useResourceWithPolling } from './useResource';
import { RemoteAppInfo } from 'shared/types';
import ServiceController from 'shared/controller';
import { SignalNodeRef } from 'shared/signals';

const WATCH_HEARTBEAT_MS = 60_000;

export const useRunningApps = (
    deviceFingerprint: string | null,
    onAppOpened?: (app: RemoteAppInfo) => void,
) => {
    const [runningApps, setRunningApps] = useState<RemoteAppInfo[]>([]);
    const signalRef = useRef<SignalNodeRef<[RemoteAppInfo[]], string> | null>(null);
    const scRef = useRef<ServiceController | null>(null);
    const prevIdsRef = useRef<Set<string> | null>(null);
    const onAppOpenedRef = useRef(onAppOpened);
    onAppOpenedRef.current = onAppOpened;

    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        const running = await serviceController.apps.getRunningApps();
        if (shouldAbort()) return;
        prevIdsRef.current = new Set(running.map(a => a.id));
        setRunningApps(running);
    }, []);

    const clearSignals = useCallback((serviceController: ServiceController) => {
        if (signalRef.current) {
            serviceController.apps.runningAppsChanged.detach(signalRef.current);
            signalRef.current = null;
        }
        serviceController.apps.unwatchRunningApps();
        scRef.current = null;
    }, []);

    const setupSignals = useCallback((serviceController: ServiceController) => {
        clearSignals(serviceController);
        scRef.current = serviceController;
        serviceController.apps.watchRunningApps();
        signalRef.current = serviceController.apps.runningAppsChanged.add((apps: RemoteAppInfo[]) => {
            if (prevIdsRef.current && onAppOpenedRef.current) {
                for (const app of apps) {
                    if (!prevIdsRef.current.has(app.id)) {
                        onAppOpenedRef.current(app);
                    }
                }
            }
            prevIdsRef.current = new Set(apps.map(a => a.id));
            setRunningApps(apps);
        });
    }, [clearSignals]);

    const poll = useCallback(() => {
        scRef.current?.apps.watchRunningApps();
    }, []);

    const { isLoading, error, reload } = useResourceWithPolling({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
        interval: WATCH_HEARTBEAT_MS,
        poll,
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

    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        const uri = await serviceController.apps.getAppIcon(appId);
        if (shouldAbort()) return;
        setIconUri(uri);
    }, [appId]);

    useResource({ deviceFingerprint, load, resourceKey: appId });

    return iconUri;
};
