import { useCallback, useRef, useState } from 'react';
import { useResource, useResourceWithPolling } from './useResource';
import { RemoteAppInfo, RemoteAppWindow, RemoteAppWindowActionPayload } from 'shared/types';
import ServiceController from 'shared/controller';
import { SignalNodeRef } from 'shared/signals';
import { decodeMediaChunk } from 'shared/mediaStream';
import { getServiceController } from '@/lib/utils';
import superman from '@/modules/superman';

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

// ── Window Capture via H.264 Stream ──

const HEARTBEAT_INTERVAL_MS = 3_000;
const MOBILE_STREAM_FPS = 8;
const MOBILE_STREAM_QUALITY = 0.4;
const MAX_RETRIES = 5;

export type WindowFrameState = {
    frameUri: string;
    width: number;
    height: number;
    dpi: number;
};

export const useWindowCapture = (windowId: string | null, deviceFingerprint: string | null) => {
    const [frameState, setFrameState] = useState<WindowFrameState | null>(null);
    const [isConnecting, setIsConnecting] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isMountedRef = useRef(true);
    const windowIdRef = useRef<string | null>(null);
    const fingerprintRef = useRef<string | null>(null);
    const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
    const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    windowIdRef.current = windowId;
    fingerprintRef.current = deviceFingerprint;

    const cleanup = useCallback(() => {
        if (heartbeatTimerRef.current) {
            clearInterval(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
        }
        if (readerRef.current) {
            readerRef.current.cancel().catch(() => {});
            readerRef.current = null;
        }
        superman.h264DecoderDestroy();
    }, []);

    const startCapture = useCallback(() => {
        if (!windowId) return;
        isMountedRef.current = true;
        setFrameState(null);
        setIsConnecting(true);
        setError(null);

        let cancelled = false;
        let retryCount = 0;

        const startStream = async () => {
            cleanup();

            try {
                const sc = await getServiceController(fingerprintRef.current);
                if (cancelled || !isMountedRef.current) return;

                const session = await sc.apps.startStreamingSession(windowId);
                if (cancelled || !isMountedRef.current) return;

                let currentWidth = session.width;
                let currentHeight = session.height;
                let currentDpi = session.dpi || 1;

                // Request mobile-friendly stream parameters
                sc.apps.streamControl(windowId, MOBILE_STREAM_FPS, MOBILE_STREAM_QUALITY).catch(() => {});

                // Heartbeat to keep stream alive
                heartbeatTimerRef.current = setInterval(() => {
                    getServiceController(fingerprintRef.current)
                        .then(sc => sc.apps.streamControl(windowId, MOBILE_STREAM_FPS, MOBILE_STREAM_QUALITY))
                        .catch(() => {});
                }, HEARTBEAT_INTERVAL_MS);

                // Read the stream
                const reader = session.stream.getReader();
                readerRef.current = reader;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done || cancelled || !isMountedRef.current) break;

                    const { metadata, payload } = decodeMediaChunk(value);
                    const isKeyframe = metadata.type === 'keyframe';

                    // Track dimension changes from keyframe metadata
                    if (metadata.width && metadata.height) {
                        currentWidth = Number(metadata.width);
                        currentHeight = Number(metadata.height);
                    }
                    if (metadata.dpi) {
                        currentDpi = Number(metadata.dpi);
                    }

                    // Decode H.264 frame via native decoder
                    const base64Jpeg = await superman.h264DecoderDecode(payload, isKeyframe);
                    if (cancelled || !isMountedRef.current) break;

                    if (base64Jpeg) {
                        setFrameState({
                            frameUri: `data:image/jpeg;base64,${base64Jpeg}`,
                            width: currentWidth,
                            height: currentHeight,
                            dpi: currentDpi,
                        });
                        setIsConnecting(false);
                    }

                    retryCount = 0;
                }

                // Stream ended normally
                if (!cancelled && isMountedRef.current) {
                    setError('Window stream ended.');
                }
            } catch (e: any) {
                if (cancelled || !isMountedRef.current) return;

                console.error('Stream error:', e);
                cleanup();

                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    const delay = 1000 + retryCount * 500;
                    console.log(`Reconnecting (attempt ${retryCount}/${MAX_RETRIES}) in ${delay}ms...`);
                    setIsConnecting(true);
                    await new Promise(r => setTimeout(r, delay));
                    if (!cancelled && isMountedRef.current) {
                        startStream();
                    }
                } else {
                    setError('Connection lost. Could not reconnect.');
                }
            }
        };

        startStream();

        return () => {
            cancelled = true;
            cleanup();
            // Best-effort stop session on server
            const wId = windowIdRef.current;
            if (wId) {
                getServiceController(fingerprintRef.current)
                    .then(sc => sc.apps.stopStreamingSession(wId))
                    .catch(() => {});
            }
        };
    }, [windowId, cleanup]);

    const stopCapture = useCallback(() => {
        isMountedRef.current = false;
        cleanup();
        // Best-effort stop
        const wId = windowIdRef.current;
        if (wId) {
            getServiceController(fingerprintRef.current)
                .then(sc => sc.apps.stopStreamingSession(wId))
                .catch(() => {});
        }
    }, [cleanup]);

    return { frameState, isConnecting, error, startCapture, stopCapture };
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
