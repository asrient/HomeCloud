import { useCallback, useRef, useState } from 'react';
import { useResource, useResourceWithPolling } from './useResource';
import { RemoteAppInfo, RemoteAppWindow, RemoteAppWindowTile, RemoteAppWindowUIState, RemoteAppWindowActionPayload } from 'shared/types';
import ServiceController from 'shared/controller';
import { SignalNodeRef } from 'shared/signals';
import { getServiceController } from '@/lib/utils';

const WATCH_HEARTBEAT_MS = 60_000;

// ── Running Apps ──

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

// ── Installed Apps ──

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

// ── Apps Available ──

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

// ── App Icon ──

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

// ── App Windows ──

export const useAppWindows = (appId: string | null, deviceFingerprint: string | null) => {
    const [windows, setWindows] = useState<RemoteAppWindow[]>([]);
    const signalRef = useRef<SignalNodeRef<[string, RemoteAppWindow[]], string> | null>(null);
    const scRef = useRef<ServiceController | null>(null);

    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        if (!appId) return;
        const wins = await serviceController.apps.getWindows(appId);
        if (shouldAbort()) return;
        setWindows(wins);
    }, [appId]);

    const clearSignals = useCallback((serviceController: ServiceController) => {
        if (signalRef.current) {
            serviceController.apps.windowsChanged.detach(signalRef.current);
            signalRef.current = null;
        }
        if (appId) serviceController.apps.unwatchWindows(appId);
        scRef.current = null;
    }, [appId]);

    const setupSignals = useCallback((serviceController: ServiceController) => {
        if (!appId) return;
        clearSignals(serviceController);
        scRef.current = serviceController;
        serviceController.apps.watchWindows(appId);
        signalRef.current = serviceController.apps.windowsChanged.add((changedAppId: string, wins: RemoteAppWindow[]) => {
            if (changedAppId !== appId) return;
            setWindows(wins);
        });
    }, [appId, clearSignals]);

    const poll = useCallback(() => {
        if (appId) scRef.current?.apps.watchWindows(appId);
    }, [appId]);

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

// ── Window Capture Loop ──

const TILE_SIZE = 64;
const QUALITY = 0.5;
const CAPTURE_INTERVAL_MS = 350;
const MAX_CONSECUTIVE_ERRORS = 5;

export const useWindowCapture = (windowId: string | null, deviceFingerprint: string | null) => {
    const [uiState, setUiState] = useState<RemoteAppWindowUIState | null>(null);
    const [isConnecting, setIsConnecting] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const lastTimestampRef = useRef<number>(0);
    const isMountedRef = useRef(true);
    const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const consecutiveErrorsRef = useRef(0);
    const windowIdRef = useRef<string | null>(null);
    const fingerprintRef = useRef<string | null>(null);

    windowIdRef.current = windowId;
    fingerprintRef.current = deviceFingerprint;

    const captureLoop = useCallback(async () => {
        const wId = windowIdRef.current;
        if (!wId || !isMountedRef.current) return;

        try {
            const sc = await getServiceController(fingerprintRef.current);
            if (wId !== windowIdRef.current || !isMountedRef.current) return;

            const sinceTimestamp = lastTimestampRef.current;
            const snapshot = await sc.apps.getWindowSnapshot(wId, sinceTimestamp, TILE_SIZE, QUALITY);
            if (wId !== windowIdRef.current || !isMountedRef.current) return;

            consecutiveErrorsRef.current = 0;
            setIsConnecting(false);

            if (sinceTimestamp > 0) {
                // Delta update — merge new tiles into existing state
                if (snapshot.tiles.length > 0) {
                    setUiState((prev) => {
                        if (!prev) return snapshot;
                        const tileMap = new Map<string, RemoteAppWindowTile>();
                        for (const t of prev.tiles) tileMap.set(`${t.xIndex}_${t.yIndex}`, t);
                        for (const t of snapshot.tiles) tileMap.set(`${t.xIndex}_${t.yIndex}`, t);
                        return { ...snapshot, tiles: Array.from(tileMap.values()) };
                    });
                }
                // If no tiles changed, keep current uiState as-is
            } else {
                // Initial full snapshot
                setUiState(snapshot);
            }

            if (snapshot.tiles.length > 0) {
                const maxTs = Math.max(...snapshot.tiles.map((t) => t.timestamp));
                lastTimestampRef.current = maxTs;
            }
        } catch (e: any) {
            console.error('Capture error:', e);
            consecutiveErrorsRef.current++;
            if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
                setError('Window is no longer available. It may have been closed.');
                return;
            }
        }

        if (isMountedRef.current && windowIdRef.current === wId) {
            captureTimerRef.current = setTimeout(captureLoop, CAPTURE_INTERVAL_MS);
        }
    }, []);

    // Start/stop capture loop when windowId changes
    const startCapture = useCallback(() => {
        if (!windowId) return;
        lastTimestampRef.current = 0;
        setUiState(null);
        setIsConnecting(true);
        setError(null);
        consecutiveErrorsRef.current = 0;
        isMountedRef.current = true;
        captureLoop();
    }, [windowId, captureLoop]);

    const stopCapture = useCallback(() => {
        isMountedRef.current = false;
        if (captureTimerRef.current) {
            clearTimeout(captureTimerRef.current);
            captureTimerRef.current = null;
        }
    }, []);

    return { uiState, isConnecting, error, startCapture, stopCapture };
};

// ── Window Action Dispatch ──

export const useWindowActions = (windowId: string | null, deviceFingerprint: string | null) => {
    const windowIdRef = useRef<string | null>(null);
    const fingerprintRef = useRef<string | null>(null);
    windowIdRef.current = windowId;
    fingerprintRef.current = deviceFingerprint;

    const dispatchAction = useCallback(
        async (payload: Omit<RemoteAppWindowActionPayload, 'windowId'>) => {
            const wId = windowIdRef.current;
            if (!wId) return;
            try {
                const sc = await getServiceController(fingerprintRef.current);
                await sc.apps.performWindowAction({ ...payload, windowId: wId } as RemoteAppWindowActionPayload);
            } catch (e: any) {
                console.error('Action failed:', e);
            }
        },
        [],
    );

    return { dispatchAction };
};
