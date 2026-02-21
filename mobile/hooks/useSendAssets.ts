import { useCallback } from "react";
import { getServiceController } from "@/lib/utils";
import { useManagedLoading } from "./useManagedLoading";
import { File } from "expo-file-system/next";

interface SendAssetsOptions<T> {
    /** Extract the file path / URI from each item. */
    getPath: (item: T) => string;
    /** Extract the source device fingerprint. Defaults to local fingerprint. */
    getSourceFingerprint?: (item: T) => string | null;
    /** Label used in the progress title (e.g. "files", "photos"). Default: "items". */
    label?: string;
    /** Delete the local cached file after sending. Default: false. */
    deleteAfter?: boolean;
    /** Allow the user to cancel the send. Default: true. */
    canCancel?: boolean;
}

export function useSendAssets() {
    const { withLoading, isActive } = useManagedLoading();

    const sendAssets = useCallback(async <T>(
        destFingerprint: string | null,
        items: T[],
        options: SendAssetsOptions<T>,
    ) => {
        const {
            getPath,
            getSourceFingerprint,
            label = 'items',
            deleteAfter = false,
            canCancel = true,
        } = options;

        return withLoading(async (isCancelled, setTitle) => {
            const sc = await getServiceController(destFingerprint);
            for (let i = 0; i < items.length; i++) {
                if (isCancelled()) break;
                setTitle(`Sending ${i + 1}/${items.length} ${label}...`);
                const item = items[i];
                const sourceFingerprint = getSourceFingerprint?.(item) ?? modules.config.FINGERPRINT;
                const path = getPath(item);
                await sc.files.download(sourceFingerprint, path);
                if (deleteAfter) {
                    const file = new File(path);
                    if (file.exists) {
                        file.delete();
                    }
                }
            }
        }, {
            title: `Sending 1/${items.length} ${label}...`,
            canCancel,
            errorTitle: 'Could not send',
        });
    }, [withLoading]);

    return {
        sendAssets,
        isSending: isActive,
    };
}
