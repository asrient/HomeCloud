import Image from 'next/image';
import { getUrlFromIconKey } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface DeviceIconProps {
    iconKey?: string | null;
    size?: number;
    className?: string;
    alt?: string;
}

/**
 * DeviceIcon component that properly handles device icons of varying aspect ratios.
 * Phone icons are taller than wide, while desktop/laptop icons are more square.
 * This component ensures consistent layout by constraining the icon to a fixed container.
 */
export function DeviceIcon({ iconKey, size = 32, className, alt = "Device icon" }: DeviceIconProps) {
    return (
        <div
            className={cn("flex items-center justify-center flex-shrink-0", className)}
            style={{ width: size, height: size }}
        >
            <Image
                src={getUrlFromIconKey(iconKey)}
                width={size}
                height={size}
                alt={alt}
                className="object-contain max-w-full max-h-full"
            />
        </div>
    );
}

export default DeviceIcon;
