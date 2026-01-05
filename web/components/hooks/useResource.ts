import { getServiceController } from "@/lib/utils";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import ServiceController from "shared/controller";
import { useAppState } from "./useAppState";


export const useResource = ({
    deviceFingerprint, load, clearSignals, setupSignals,
}: {
    deviceFingerprint: string | null;
    load: (serviceController: ServiceController, shouldAbort: () => boolean) => Promise<void>;
    clearSignals?: (serviceController: ServiceController) => void;
    setupSignals?: (serviceController: ServiceController) => void;
}) => {
    const isLoadingRef = useRef(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const serviceControllerRef = useRef<ServiceController | null>(null);
    const currentFingerprint = useRef<string | null>('');
    const hasSignalSetupRef = useRef(false);

    const { connections } = useAppState();

    const isConnected = useMemo(() => {
        if (deviceFingerprint === null) {
            return true;
        }
        return connections.some(conn => conn.fingerprint === deviceFingerprint);
    }, [connections, deviceFingerprint]);

    const reload = useCallback(async () => {
        // Prevent reloading if already loading
        if (isLoadingRef.current) {
            return;
        }
        if (deviceFingerprint !== currentFingerprint.current) {
            return;
        }
        const _fingerprint = currentFingerprint.current;
        const shouldAbort = () => {
            return _fingerprint !== currentFingerprint.current;
        };
        // Set loading state
        isLoadingRef.current = true;
        setIsLoading(true);
        setError(null);
        try {
            if (!serviceControllerRef.current) {
                serviceControllerRef.current = await getServiceController(deviceFingerprint);
            }
            if (shouldAbort()) {
                // Device fingerprint changed during async operation
                return;
            }
            await load(serviceControllerRef.current, shouldAbort);
        } catch (error: any) {
            if (shouldAbort()) {
                // Device fingerprint changed during async operation
                return;
            }
            console.error('Error reloading resource:', error);
            setError(error.message || 'Failed to reload resource');
        } finally {
            if (shouldAbort()) {
                // Device fingerprint changed during async operation
                return;
            }
            isLoadingRef.current = false;
            setIsLoading(false);
        }
    }, [deviceFingerprint, load]);

    useEffect(() => {
        if (isLoadingRef.current && deviceFingerprint === currentFingerprint.current) {
            return;
        }
        const _fingerprint = deviceFingerprint;
        const shouldAbort = () => {
            return _fingerprint !== currentFingerprint.current;
        }
        // This will always be the case when component is first mounted
        if (deviceFingerprint !== currentFingerprint.current) {
            if (serviceControllerRef.current && hasSignalSetupRef.current) {
                clearSignals && clearSignals(serviceControllerRef.current);
                hasSignalSetupRef.current = false;
            }
            serviceControllerRef.current = null;
        }

        const init = async () => {
            console.log('Initializing resource for device:', _fingerprint);
            const serviceController = await getServiceController(_fingerprint);
            if (shouldAbort()) {
                // Device fingerprint changed during async operation
                console.log('Device fingerprint changed during init, aborting load');
                return;
            }
            serviceControllerRef.current = serviceController;
            setupSignals && !hasSignalSetupRef.current && setupSignals(serviceController);
            hasSignalSetupRef.current = true;
            await load(serviceController, shouldAbort);
        };

        // Set loading state
        currentFingerprint.current = deviceFingerprint;
        isLoadingRef.current = true;
        setIsLoading(true);
        setError(null);
        init().catch((err) => {
            if (shouldAbort()) {
                console.log('Device fingerprint changed during init, aborting load');
                return;
            }
            console.error('Error initializing resource:', err);
            setError(err.message || 'Failed to initialize resource');
        }).finally(() => {
            if (shouldAbort()) {
                console.log('Device fingerprint changed during init, aborting load');
                return;
            }
            isLoadingRef.current = false;
            setIsLoading(false);
        });
        return () => { clearSignals && serviceControllerRef.current && hasSignalSetupRef.current && clearSignals(serviceControllerRef.current); };
    }, [clearSignals, isConnected, deviceFingerprint, load, setupSignals]);

    return { isLoading, error, reload };
};

export const useResourceWithPolling = ({
    deviceFingerprint, load, interval, clearSignals, setupSignals,
}: {
    deviceFingerprint: string | null;
    load: (serviceController: ServiceController, shouldAbort: () => boolean) => Promise<void>;
    interval: number;
    clearSignals?: (serviceController: ServiceController) => void;
    setupSignals?: (serviceController: ServiceController) => void;
}) => {
    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        clearSignals,
        setupSignals,
    });

    useEffect(() => {
        const pollingInterval = setInterval(() => {
            reload();
        }, interval);

        return () => {
            clearInterval(pollingInterval);
        };
    }, [deviceFingerprint, interval, reload]);

    return { isLoading, error, reload };
};
