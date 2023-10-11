import { cn } from "@/lib/utils"
import { useCallback, useEffect, useState } from "react"
import Image from "next/image"

export default function LazyImage({ fetchSrc, src, alt, ...rest }: {
    fetchSrc: () => Promise<string | null>;
    src: string;
} & React.ComponentProps<typeof Image>) {

    const [imgSrc, setImgSrc] = useState<string | null>(null);

    const loadImage = useCallback(async () => {
        try {
            const imgSrc = await fetchSrc();
            setImgSrc(imgSrc || src);
        } catch (e) {
            setImgSrc(src);
        }
    }, [fetchSrc, src]);

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
            onError={() => {
                setImgSrc(src);
            }}
        />
    )
}
