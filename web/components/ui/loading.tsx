import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import LoadingIcon from "./loadingIcon";

type LoadingProps = {
    onVisible: () => void;
};

export default function Loading({ onVisible }: LoadingProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ref.current) {
            const observer = new IntersectionObserver(([entry]) => {
                if (entry.isIntersecting) {
                    onVisible();
                }
            }, { threshold: [1] });

            observer.observe(ref.current);

            return () => {
                observer.disconnect();
            };
        }
    }, [onVisible]);

    return (
        <span ref={ref}>
            <LoadingIcon />
        </span>
    );
};
