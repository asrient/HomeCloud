import { useCallback, useEffect, useRef, useState } from 'react';
import { useResource, useResourceWithPolling } from './useResource';
import { RemoteAppInfo, RemoteAppWindow, WindowEvent } from 'shared/types';
import ServiceController from 'shared/controller';
import { SignalNodeRef } from 'shared/signals';
import { getServiceController } from '@/lib/utils';

export const useRunningApps = (
    deviceFingerprint: string | null,
    onAppOpened?: (app: RemoteAppInfo) => void,
) => {
    const [runningApps, setRunningApps] = useState<RemoteAppInfo[]>([]);
    const launchRef = useRef<SignalNodeRef<[RemoteAppInfo], string> | null>(null);
    const quitRef = useRef<SignalNodeRef<[RemoteAppInfo], string> | null>(null);
    const onAppOpenedRef = useRef(onAppOpened);
    onAppOpenedRef.current = onAppOpened;

    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        const running = await serviceController.apps.getRunningApps();
        if (shouldAbort()) return;
        // Dedup by app id — native may return multiple processes with the same bundle ID
        const seen = new Set<string>();
        setRunningApps(running.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; }));
    }, []);

    const clearSignals = useCallback((serviceController: ServiceController) => {
        if (launchRef.current) {
            serviceController.apps.appLaunched.detach(launchRef.current);
            launchRef.current = null;
        }
        if (quitRef.current) {
            serviceController.apps.appQuit.detach(quitRef.current);
            quitRef.current = null;
        }
    }, []);

    const setupSignals = useCallback((serviceController: ServiceController) => {
        clearSignals(serviceController);
        launchRef.current = serviceController.apps.appLaunched.add((app: RemoteAppInfo) => {
            onAppOpenedRef.current?.(app);
            setRunningApps(prev => prev.some(a => a.id === app.id) ? prev : [...prev, app]);
        });
        quitRef.current = serviceController.apps.appQuit.add((app: RemoteAppInfo) => {
            setRunningApps(prev => prev.filter(a => a.id !== app.id));
        });
    }, [clearSignals]);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
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

const WATCH_HEARTBEAT_MS = 60_000;

export const useAppWindows = (appId: string | null, deviceFingerprint: string | null) => {
    const [windows, setWindows] = useState<RemoteAppWindow[]>([]);
    const createdRef = useRef<SignalNodeRef<[WindowEvent], string> | null>(null);
    const destroyedRef = useRef<SignalNodeRef<[WindowEvent], string> | null>(null);

    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        if (!appId) return;
        const wins = await serviceController.apps.getWindows(appId);
        if (shouldAbort()) return;
        setWindows(wins);
    }, [appId]);

    const clearSignals = useCallback((serviceController: ServiceController) => {
        if (createdRef.current) {
            serviceController.apps.windowCreated.detach(createdRef.current);
            createdRef.current = null;
        }
        if (destroyedRef.current) {
            serviceController.apps.windowDestroyed.detach(destroyedRef.current);
            destroyedRef.current = null;
        }
    }, []);

    const setupSignals = useCallback((serviceController: ServiceController) => {
        if (!appId) return;
        clearSignals(serviceController);
        serviceController.apps.watchWindowsHeartbeat();
        createdRef.current = serviceController.apps.windowCreated.add((evt: WindowEvent) => {
            if (evt.app.id !== appId) return;
            setWindows(prev => prev.some(w => w.id === evt.window.id) ? prev : [...prev, evt.window]);
        });
        destroyedRef.current = serviceController.apps.windowDestroyed.add((evt: WindowEvent) => {
            if (evt.app.id !== appId) return;
            setWindows(prev => prev.filter(w => w.id !== evt.window.id));
        });
    }, [appId, clearSignals]);

    const poll = useCallback(async () => {
        const sc = await getServiceController(deviceFingerprint);
        sc.apps.watchWindowsHeartbeat();
    }, [deviceFingerprint]);

    const { isLoading, error, reload } = useResourceWithPolling({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
        interval: WATCH_HEARTBEAT_MS,
        poll,
    });

    return { windows, isLoading, error, reload };
};
