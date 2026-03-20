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

            // Group items by source fingerprint for batched downloads
            const grouped = new Map<string, { paths: string[]; items: T[] }>();
            for (const item of items) {
                const fp = getSourceFingerprint?.(item) ?? modules.config.FINGERPRINT;
                const key = fp ?? '__local__';
                if (!grouped.has(key)) grouped.set(key, { paths: [], items: [] });
                const group = grouped.get(key)!;
                group.paths.push(getPath(item));
                group.items.push(item);
            }

            for (const [key, { paths, items: groupItems }] of grouped) {
                if (isCancelled()) break;
                const fp = key === '__local__' ? null : key;
                setTitle(`Sending ${paths.length} ${label}...`);
                await sc.files.download(fp, paths);
                if (deleteAfter) {
                    for (const item of groupItems) {
                        const filePath = getPath(item);
                        const file = new File(filePath);
                        if (file.exists) {
                            file.delete();
                        }
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
