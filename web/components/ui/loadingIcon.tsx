import { cn } from "@/lib/utils";
import { Loader } from "lucide-react";

const sizeMap = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-8 w-8',
} as const;

export default function LoadingIcon({
    className,
    size = 'md',
}: {
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}) {
    return (
        <Loader className={cn("animate-spin [animation-duration:1.5s]", sizeMap[size], className)} />
    );
}
