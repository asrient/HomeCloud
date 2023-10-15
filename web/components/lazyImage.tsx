import { useCallback, useState } from "react"
import Image from "next/image"

export default function LazyImage({ fetchSrc, src, alt, ...rest }: {
    fetchSrc: () => Promise<string | null>;
    src: string;
} & React.ComponentProps<typeof Image>) {

    const [imgSrc, setImgSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const loadImage = useCallback(async () => {
        if(isLoading) return;
        setIsLoading(true);
        try {
            const imgSrc = await fetchSrc();
            setImgSrc(imgSrc || src);
        } catch (e) {
            setImgSrc(src);
        } finally {
            setIsLoading(false);
        }
    }, [fetchSrc, src, isLoading]);

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
