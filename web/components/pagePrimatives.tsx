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
            isMacosTheme() && 'bg-background shadow-xl h-[3rem] py-1 px-3',
            !isMacosTheme() && 'h-[4rem] pt-4 px-8'
        )}>

            <div className='flex items-center space-x-2 py-2 px-1 min-w-max'>
                {
                    isMacosTheme() && <Button size='icon'
                        disabled={!canGoBack} variant='secondary' className="text-primary mr-2"
                        title="Back" onClick={goBack}>
                        <ChevronLeft size={20} />
                    </Button>
                }
                {icon && <ThemedIcon name={icon}
                    size={isMacosTheme() ? 20 : 30}
                />}
                <span className={cn(
                    'truncate text-sm text-foreground font-medium',
                    !isMacosTheme() && 'md:text-2xl font-medium'
                )}>{title}</span>
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

export const MenuButton = ({ children, onClick, disabled, title, className, selected, ref }:
    {
        children: React.ReactNode,
        onClick?: MouseEventHandler<HTMLButtonElement>,
        disabled?: boolean,
        title?: string,
        className?: string,
        selected?: boolean,
        ref?: React.Ref<HTMLButtonElement>
    }) => {
    return (
        <Button size='sm' variant={selected ? 'default' : 'ghost'}
            className={cn(isMacosTheme() ? 'rounded-full': 'rounded-md', className)}
            title={title} onClick={onClick} disabled={disabled} ref={ref}>
            {children}
        </Button>
    )
}

export function MenuGroup({ children }: {
    children: React.ReactNode
}) {
    return (
            <div className={cn('flex flex-row items-center text-xs space-x-1 mx-2',
                isMacosTheme() ? 'text-primary': 'text-foreground',
                isMacosTheme() && 'bg-background/50 dark:bg-foreground/5 border rounded-full'
            )}>
                {children}
            </div>
    )
}
