import { useCallback, useEffect, useRef, useState } from 'react';
import { useResource } from './useResource';
import { RemoteAppInfo, RemoteAppWindowActionPayload } from 'shared/types';
import { decodeMediaChunk } from 'shared/mediaStream';
import ServiceController from 'shared/controller';
import { getServiceController } from '@/lib/utils';
import H264Player from '@/modules/h264-player';

// ── Running Apps ──

export const useRunningApps = (
    deviceFingerprint: string | null,
) => {
    const [runningApps, setRunningApps] = useState<RemoteAppInfo[]>([]);

    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        const running = await serviceController.apps.getRunningApps();
        if (shouldAbort()) return;
        const seen = new Set<string>();
        setRunningApps(running.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; }));
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
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

export const useTerminalAvailable = (deviceFingerprint: string | null) => {
    const [available, setAvailable] = useState<boolean | null>(null);

    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        const result = await serviceController.terminal.isAvailable();
        if (shouldAbort()) return;
        setAvailable(result);
    }, []);

    const { isLoading } = useResource({ deviceFingerprint, load });

    return { available, isLoading };
};

// ── App Icon ──

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

// ── Full-screen Capture (H.264 stream) ──

const MAX_RETRIES = 5;
const HEARTBEAT_INTERVAL_MS = 3000;

export type ScreenFrameState = {
    width: number;
    height: number;
    dpi: number;
};

export const useScreenCapture = (deviceFingerprint: string | null) => {
    const [frameState, setFrameState] = useState<ScreenFrameState | null>(null);
    const [isConnecting, setIsConnecting] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [retryAttempt, setRetryAttempt] = useState(0);
    const [sessionId, setSessionId] = useState<string | null>(null);

    const isMountedRef = useRef(true);
    const fingerprintRef = useRef<string | null>(null);
    const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
    const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const captureIdRef = useRef(0);

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
        if (sessionIdRef.current) {
            H264Player.destroySession(sessionIdRef.current);
            sessionIdRef.current = null;
            setSessionId(null);
        }
    }, []);

    const startCapture = useCallback(() => {
        isMountedRef.current = true;
        setFrameState(null);
        setIsConnecting(true);
        setError(null);
        setIsReconnecting(false);
        setRetryAttempt(0);

        const captureId = ++captureIdRef.current;
        let retryCount = 0;

        const startStream = async () => {
            cleanup();
            console.log('[H264Capture] startStream called, fingerprint:', fingerprintRef.current);

            try {
                const sc = await getServiceController(fingerprintRef.current);
                if (!isMountedRef.current || captureId !== captureIdRef.current) return;

                console.log('[H264Capture] calling startStreamingSession...');
                const session = await sc.apps.startStreamingSession();
                if (!isMountedRef.current || captureId !== captureIdRef.current) return;

                let currentWidth = session.width;
                let currentHeight = session.height;
                let currentDpi = session.dpi || 1;
                console.log('[H264Capture] session started:', { width: currentWidth, height: currentHeight, dpi: currentDpi });

                // Create native decoder session
                console.log('[H264Capture] creating native session...');
                const nativeSessionId = H264Player.createSession(currentWidth, currentHeight);
                sessionIdRef.current = nativeSessionId;
                setSessionId(nativeSessionId);
                console.log('[H264Capture] native session created:', nativeSessionId);

                setFrameState({ width: currentWidth, height: currentHeight, dpi: currentDpi });
                setIsConnecting(false);
                setIsReconnecting(false);

                // Start heartbeat
                heartbeatTimerRef.current = setInterval(() => {
                    getServiceController(fingerprintRef.current)
                        .then(sc => sc.apps.streamControl())
                        .catch(() => {});
                }, HEARTBEAT_INTERVAL_MS);

                // Read stream — yield first to let React mount H264PlayerView
                await new Promise(r => setTimeout(r, 0));
                const reader = session.stream.getReader();
                readerRef.current = reader;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done || !isMountedRef.current || captureId !== captureIdRef.current) {
                        console.log('[H264Capture] stream loop exit, done:', done);
                        break;
                    }

                    const { metadata, payload } = decodeMediaChunk(value);
                    const isKeyframe = metadata.type === 'keyframe';

                    // Update dimensions if changed
                    if (metadata.width && metadata.height) {
                        const newW = Number(metadata.width);
                        const newH = Number(metadata.height);
                        const newDpi = metadata.dpi ? Number(metadata.dpi) : currentDpi;

                        if (newW !== currentWidth || newH !== currentHeight || newDpi !== currentDpi) {
                            currentWidth = newW;
                            currentHeight = newH;
                            currentDpi = newDpi;
                            setFrameState({ width: currentWidth, height: currentHeight, dpi: currentDpi });

                            // Recreate decoder session for new dimensions
                            if (sessionIdRef.current) {
                                H264Player.destroySession(sessionIdRef.current);
                            }
                            const newSessionId = H264Player.createSession(currentWidth, currentHeight);
                            sessionIdRef.current = newSessionId;
                            setSessionId(newSessionId);
                        }
                    }

                    // Feed frame to native decoder/display
                    if (sessionIdRef.current) {
                        try {
                            await H264Player.feedFrame(sessionIdRef.current, payload, isKeyframe);
                        } catch (feedErr: any) {
                            console.error(`[H264Capture] feedFrame error:`, feedErr?.message || feedErr);
                        }
                    }

                    // Reset retry counter on successful frame
                    retryCount = 0;
                }

                // Stream ended normally
                if (!isMountedRef.current || captureId !== captureIdRef.current) return;
                setError('Window stream ended.');
            } catch (e: any) {
                if (!isMountedRef.current || captureId !== captureIdRef.current) return;

                console.error('[H264Capture] Stream error:', e?.message || e, e?.stack);
                cleanup();

                // Auto-reconnect with backoff
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    setRetryAttempt(retryCount);
                    setIsReconnecting(true);
                    const delay = 1000 + retryCount * 500;
                    await new Promise(r => setTimeout(r, delay));
                    if (isMountedRef.current && captureId === captureIdRef.current) {
                        startStream();
                    }
                } else {
                    setError('Connection lost. Could not reconnect.');
                    setIsReconnecting(false);
                }
            }
        };

        startStream();
    }, [cleanup]);

    const stopCapture = useCallback(() => {
        isMountedRef.current = false;
        captureIdRef.current++;
        cleanup();
        // Best-effort stop session on server
        getServiceController(fingerprintRef.current)
            .then(sc => sc.apps.stopStreamingSession())
            .catch(() => {});
    }, [cleanup]);

    const cancelReconnect = useCallback(() => {
        captureIdRef.current++;
        setIsReconnecting(false);
        setError('Reconnection cancelled.');
    }, []);

    return {
        sessionId,
        frameState,
        isConnecting,
        error,
        isReconnecting,
        retryAttempt,
        startCapture,
        stopCapture,
        cancelReconnect,
    };
};

// ── Screen Action Dispatch ──

export const useScreenActions = (deviceFingerprint: string | null) => {
    const fingerprintRef = useRef<string | null>(null);
    fingerprintRef.current = deviceFingerprint;

    const dispatchAction = useCallback(
        async (payload: Omit<RemoteAppWindowActionPayload, 'windowId'>) => {
            try {
                const sc = await getServiceController(fingerprintRef.current);
                await sc.apps.performWindowAction(payload as RemoteAppWindowActionPayload);
            } catch (e: any) {
                console.error('Action failed:', e);
            }
        },
        [],
    );

    return { dispatchAction };
};
