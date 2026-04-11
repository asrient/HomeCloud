import { isMacosTheme } from "@/lib/utils";
import { Flower, Folder, Settings, HardDrive, Hammer, House, AppWindow, Sparkles } from "lucide-react";
import Image from "next/image";
import { ThemedIconName } from "@/lib/enums";
import { SparklesIcon } from "@heroicons/react/24/outline";

const AIIcon = ({ className, size }: { className?: string, size?: number }) => {
    return <SparklesIcon className={className} width={size} height={size} />
}

const ThemedIcons: Record<ThemedIconName, [string, React.ElementType]> = {
    Folder: ['/icons/folder.png', Folder],
    Disk: ['/icons/ssd.png', HardDrive],
    Photos: ['/icons/photos.png', Flower],
    Settings: ['/icons/settings.png', Settings],
    Tool: ['/icons/tool.png', Hammer],
    Home: ['/icons/home.png', House],
    Apps: ['/icons/program.png', AppWindow],
    AI: ['/icons/AI.png', AIIcon],
}

export function ThemedIcon({ name, alt, size, type, className }: { name: ThemedIconName, alt?: string, size?: number, type?: 'image' | 'symbol' | 'auto', className?: string }) {
    const shouldUseImage = (isMacosTheme() && type !== 'symbol') || type === 'image';
    if (shouldUseImage) {
        return (<Image
            alt={alt || name}
            src={ThemedIcons[name][0]}
            loading="eager"
            height={size || 24}
            width={size || 24}
            className={className}
        />)
    }
    const [, IconComponent] = ThemedIcons[name];
    return <IconComponent size={size || 24} strokeWidth={1.5} className={className} />;
}
