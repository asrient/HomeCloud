import { cn, isMacosTheme } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';
import { useNavigation } from './hooks/useNavigation';
import { Button } from './ui/button';
import { ThemedIcon } from './themedIcons';
import { ThemedIconName } from "@/lib/enums";
import { forwardRef, MouseEventHandler } from 'react';

export function PageBar({ children, title, icon }: {
    children?: React.ReactNode,
    title: string,
    icon?: ThemedIconName,
}) {
    const { canGoBack, goBack } = useNavigation();
    return (
        <div className={cn(
            'flex justify-between items-center z-20',
            isMacosTheme() && 'h-[3rem] py-1 px-3 fixed top-0 md:left-[220px] lg:left-[240px] right-0',
            !isMacosTheme() && 'w-full h-[4rem] pt-4 px-8 relative'
        )}>
            {/* Progressive blur background for macOS */}
            {isMacosTheme() && (
                <>
                    <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/40 to-transparent pointer-events-none" />
                    <div className="absolute inset-0 backdrop-blur-md pointer-events-none" style={{ maskImage: 'linear-gradient(to bottom, black 0%, black 20%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 20%, transparent 100%)' }} />
                    <div className="absolute inset-0 backdrop-blur-sm pointer-events-none" style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 50%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 50%, transparent 100%)' }} />
                </>
            )}
            <div className='flex items-center space-x-2 py-2 px-1 min-w-max relative z-10'>
                {
                    isMacosTheme() && <MenuGroup>
                        <MenuButton
                            disabled={!canGoBack}
                            title="Back"
                            onClick={goBack}
                        >
                            <ChevronLeft size={18} />
                        </MenuButton>
                    </MenuGroup>
                }
                {icon && <ThemedIcon name={icon}
                    size={isMacosTheme() ? 20 : 30}
                />}
                <div className={cn(
                    'truncate text-base text-foreground font-medium',
                    !isMacosTheme() && 'md:text-2xl',
                    isMacosTheme() && 'app-dragable text-base font-semibold'
                )}>{title}</div>
            </div>
            <div className={cn('flex-1 min-w-0 h-full relative z-10', isMacosTheme() && 'app-dragable')}></div>
            {children && (<div className='flex justify-center items-center md:space-x-1 text-primary/90 p-1 relative z-10 shrink-0'>{children}</div>)}
            {isMacosTheme() && <div className='app-titlebar-space-end shrink-0'></div>}
        </div>
    )
}

export function PageContent({ children, className, onDrop }: { children: React.ReactNode, className?: string, onDrop?: (files: FileList) => void }) {
    return (
        <div
            className={cn(
                'relative overflow-y-auto w-full',
                isMacosTheme() ? 'h-full pt-[3rem]' : 'h-[calc(100%-4rem)]',
                className
            )}
            onDragOver={onDrop ? (e) => {
                e.preventDefault();
            } : undefined}
            onDrop={onDrop ? (e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    onDrop(e.dataTransfer.files);
                    e.dataTransfer.clearData();
                }
            } : undefined}
        >
            {children}
        </div>
    )
}

interface MenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    selected?: boolean;
}

export const MenuButton = forwardRef<HTMLButtonElement, MenuButtonProps>(
    ({ children, onClick, disabled, title, className, selected, ...rest }, ref) => {
        return (
            <Button
                size={isMacosTheme() ? 'sm' : 'default'}
                variant={selected ? 'default' : 'ghost'}
                className={cn(
                    'transition-all duration-150 ease-in-out',
                    isMacosTheme()
                        ? cn(
                            'rounded-full px-2.5 py-[1.15rem]',
                            selected
                                ? 'bg-secondary hover:bg-muted'
                                : 'hover:bg-muted/50',
                            'text-foreground hover:text-foreground'
                        )
                        : 'rounded-md',
                    className
                )}
                title={title}
                onClick={onClick}
                disabled={disabled}
                ref={ref}
                {...rest}
            >
                {children}
            </Button>
        )
    }
)
MenuButton.displayName = 'MenuButton'

export function MenuGroup({ children }: {
    children: React.ReactNode
}) {
    return (
        <div className={cn('flex flex-row items-center text-xs mx-1 text-foreground',
            isMacosTheme() && 'bg-white/60 dark:bg-black/20 backdrop-blur-lg backdrop-saturate-150 border border-white/80 dark:border-white/10 rounded-full shadow-2xl'
        )}>
            {children}
        </div>
    )
}
