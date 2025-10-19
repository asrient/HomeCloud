import { getServiceController } from "@/lib/utils";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import ServiceController from "shared/controller";
import { useAppState } from "./useAppState";


export const useResource = ({
    deviceFingerprint, load, clearSignals, setupSignals,
}: {
    deviceFingerprint: string | null;
    load: (serviceController: ServiceController) => Promise<void>;
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
        // Set loading state
        isLoadingRef.current = true;
        setIsLoading(true);
        setError(null);
        try {
            if (!serviceControllerRef.current) {
                serviceControllerRef.current = await getServiceController(deviceFingerprint);
            }
            await load(serviceControllerRef.current);
        } catch (error: any) {
            console.error('Error reloading resource:', error);
            setError(error.message || 'Failed to reload resource');
        } finally {
            isLoadingRef.current = false;
            setIsLoading(false);
        }
    }, [deviceFingerprint, load]);

    useEffect(() => {
        if (isLoadingRef.current) {
            return;
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
            console.log('Initializing resource for device:', deviceFingerprint);
            const serviceController = await getServiceController(deviceFingerprint);
            serviceControllerRef.current = serviceController;
            setupSignals && !hasSignalSetupRef.current && setupSignals(serviceController);
            hasSignalSetupRef.current = true;
            await load(serviceController);
        };

        // Set loading state
        currentFingerprint.current = deviceFingerprint;
        isLoadingRef.current = true;
        setIsLoading(true);
        setError(null);
        init().catch((err) => {
            console.error('Error initializing resource:', err);
            setError(err.message || 'Failed to initialize resource');
        }).finally(() => {
            isLoadingRef.current = false;
            setIsLoading(false);
        });
        return () => { clearSignals && serviceControllerRef.current && hasSignalSetupRef.current && clearSignals(serviceControllerRef.current); };
    }, [clearSignals, isConnected, deviceFingerprint, load, setupSignals]);

    return { isLoading, error, reload };
};
