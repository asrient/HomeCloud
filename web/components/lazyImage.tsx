import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"

export default function LazyImage({ fetchSrc, itemKey, src, alt, ...rest }: {
    fetchSrc: () => Promise<string | null>;
    /** Stable identifier for the item this image represents.
     *  When it changes, the loaded image is discarded and re-fetched. */
    itemKey?: string;
    src: string;
} & React.ComponentProps<typeof Image>) {

    const [imgSrc, setImgSrc] = useState<string | null>(null);
    const loadingRef = useRef(false);
    const activeKeyRef = useRef(itemKey);

    // When the item identity changes, reset so we re-fetch.
    useEffect(() => {
        if (activeKeyRef.current !== itemKey) {
            activeKeyRef.current = itemKey;
            loadingRef.current = false;
            setImgSrc(null);
        }
    }, [itemKey]);

    const loadImage = useCallback(async () => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        const startKey = activeKeyRef.current;
        try {
            const result = await fetchSrc();
            if (activeKeyRef.current === startKey) {
                setImgSrc(result || src);
            }
        } catch (e) {
            if (activeKeyRef.current === startKey) {
                setImgSrc(src);
            }
        } finally {
            if (activeKeyRef.current === startKey) {
                loadingRef.current = false;
            }
        }
    }, [fetchSrc, src]);

    const onError = useCallback(() => {
        setImgSrc(src);
    }, [src]);

    if (!imgSrc) {
        return (
            <Image {...rest}
                alt={alt}
                src={src}
                loading="lazy"
                onLoad={loadImage}
            />
        )
    }

    return (
        <Image {...rest}
            alt={alt}
            src={imgSrc}
            loading="lazy"
            onError={onError}
        />
    )
}
