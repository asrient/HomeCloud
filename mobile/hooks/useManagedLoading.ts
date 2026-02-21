import { useCallback, useEffect, useRef } from "react";
import { useLoading } from "./useLoading";
import { getLocalServiceController } from "@/lib/utils";

type LoadingTask<T> = (
    isCancelled: () => boolean,
    setTitle: (title: string) => void,
) => Promise<T>;

const DEFAULT_DELAY = 0; // ms

interface WithLoadingOptions {
    title?: string;
    canCancel?: boolean;
    showErrorAlert?: boolean;
    errorTitle?: string;
    /** Delay in ms before showing the loading modal. Use 0 to show immediately. */
    delay?: number;
}

export function useManagedLoading() {
    const { showLoading, hideLoading, isActive } = useLoading();
    const tokenRef = useRef<string | null>(null);
    const cancelledRef = useRef(false);
    const mountedRef = useRef(true);

    // Clean up on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            cancelledRef.current = true;
            if (tokenRef.current) {
                hideLoading(tokenRef.current);
                tokenRef.current = null;
            }
        };
    }, [hideLoading]);

    const withLoading = useCallback(async <T>(
        task: LoadingTask<T>,
        options: WithLoadingOptions = {},
    ): Promise<T | undefined> => {
        const {
            canCancel = false,
            showErrorAlert = true,
            errorTitle = 'Error',
            delay = DEFAULT_DELAY,
        } = options;
        let title = options.title ?? 'Loading';

        // Clean up any existing loading entry
        if (tokenRef.current) {
            hideLoading(tokenRef.current);
            tokenRef.current = null;
        }
        cancelledRef.current = false;

        const handleCancel = canCancel ? () => {
            cancelledRef.current = true;
        } : undefined;

        // Delay showing the loading modal
        const showImmediately = delay <= 0;
        let delayTimer: ReturnType<typeof setTimeout> | null = null;

        if (showImmediately) {
            tokenRef.current = showLoading({
                title,
                canCancel,
                onCancel: handleCancel,
            });
        } else {
            delayTimer = setTimeout(() => {
                if (cancelledRef.current) return;
                tokenRef.current = showLoading({
                    title,
                    canCancel,
                    onCancel: handleCancel,
                });
            }, delay);
        }

        const setTitle = (newTitle: string) => {
            if (!mountedRef.current) return;
            if (tokenRef.current) {
                hideLoading(tokenRef.current);
                tokenRef.current = showLoading({
                    title: newTitle,
                    canCancel,
                    onCancel: handleCancel,
                });
            } else {
                // Modal not yet shown, update the title for when it appears
                title = newTitle;
            }
        };

        try {
            const result = await task(
                () => cancelledRef.current,
                setTitle,
            );
            return result;
        } catch (error) {
            console.error('Loading task failed:', error);
            if (showErrorAlert) {
                const localSc = getLocalServiceController();
                const message = error instanceof Error ? error.message : 'An error occurred.';
                localSc.system.alert(errorTitle, message);
            }
            return undefined;
        } finally {
            if (delayTimer) clearTimeout(delayTimer);
            if (tokenRef.current) {
                hideLoading(tokenRef.current);
                tokenRef.current = null;
            }
        }
    }, [showLoading, hideLoading]);

    return {
        withLoading,
        isActive,
    };
}
