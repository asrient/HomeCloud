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
            'w-full flex justify-between items-center z-20 relative',
            isMacosTheme() && 'bg-background h-[3rem] py-1 px-3',
            !isMacosTheme() && 'h-[4rem] pt-4 px-8'
        )}>

            <div className='flex items-center space-x-2 py-2 px-1 min-w-max'>
                {
                    isMacosTheme() && <Button size='sm'
                        disabled={!canGoBack} variant='secondary' className="text-foreground bg-white/80 dark:bg-foreground/5 p-2 border-none rounded-full shadow-2xl"
                        title="Back" onClick={goBack}>
                        <ChevronLeft size={20} />
                    </Button>
                }
                {icon && <ThemedIcon name={icon}
                    size={isMacosTheme() ? 20 : 30}
                />}
                <div className={cn(
                    'truncate text-base text-foreground font-medium',
                    !isMacosTheme() && 'md:text-2xl',
                    isMacosTheme() && 'app-dragable'
                )}>{title}</div>
            </div>
            <div className={cn('grow w-full h-full', isMacosTheme() && 'app-dragable')}></div>
            {children && (<div className='flex justify-center items-center md:space-x-1 text-primary/90 p-1'>{children}</div>)}
            {isMacosTheme() && <div className='app-titlebar-space-end'></div>}
        </div>
    )
}

export function PageContent({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={cn(
            'relative overflow-y-auto w-full',
            isMacosTheme() ? 'h-[calc(100%-3rem)]' : 'h-[calc(100%-4rem)]',
            className
        )}>
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
                size={'default'}
                variant={selected ? 'default' : 'ghost'}
                className={cn(isMacosTheme() ? 'rounded-full hover:bg-muted hover:text-foreground' : 'rounded-md', className)}
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
            <div className={cn('flex flex-row items-center text-xs mx-2 text-foreground',
                isMacosTheme() && 'bg-white/80 dark:bg-foreground/5 rounded-full shadow-2xl'
            )}>
                {children}
            </div>
    )
}
