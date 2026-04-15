import { cn, isMacosTheme } from "@/lib/utils"
import { ChevronRightIcon } from "@heroicons/react/24/outline"
import { Button } from "./ui/button"

export function Section({ title, footer, children }: {
    title?: string,
    footer?: string,
    children: React.ReactNode
}) {
    return (
        <div className="m-2 mb-4 p-1 mx-auto max-w-2xl">
        {title && <h3 className='text-sm font-semibold my-3'>{title}</h3>}
        <div className={cn('p-1 border',
            isMacosTheme() ? 'rounded-lg border-none' : 'rounded-sm border-border/70 dark:border-border/20',
            isMacosTheme() ? 'bg-secondary/40 dark:bg-secondary/20' : 'bg-background dark:bg-secondary/20'
        )}>
            {children}
        </div>
        {footer && <p className='text-xs text-muted-foreground mt-2 ml-1'>{footer}</p>}
        </div>
    )
}

export function FormContainer({ children }: {
    children: React.ReactNode
}) {
    return (
        <div className='px-4 py-3 min-h-full'>
            {children}
        </div>
    )
}

export function Line({ children, title }: {
    children?: React.ReactNode,
    title?: React.ReactNode,
}) {
    return (
        <div className={cn('flex items-center justify-between border-b last-of-type:border-none text-sm',
            isMacosTheme() ? 'dark:border-border/30 border-border/70' : 'border-border',
            isMacosTheme() ? 'min-h-[2.4rem] p-1' : 'min-h-[3.5rem] p-3 dark:border-black/30',
        )}>
            {
                title && <div className='font-regular'>
                    {title}
                </div>
            }
            {children && <div className='ml-2 text-foreground text-right select-text break-all'>{children}</div>}
        </div>
    )
}

export function LineLink({ text, type, onClick }: {
    text: string,
    type?: 'danger' | 'primary' | 'default',
    onClick?: () => void,
}) {

    let textColor = 'text-foreground/70';

    switch (type) {
        case 'primary':
            textColor = 'text-primary';
            break;
        case 'danger':
            textColor = 'text-red-500';
            break;
        default:
            break;
    }

    return (
        <Button variant={'ghost'} size={'sm'} onClick={onClick} className={cn('flex items-center justify-end hover:bg-secondary select-none text-xs', textColor)}>
            <span>{text}</span>
            <ChevronRightIcon className='h-4 w-4 ml-1' />
        </Button>
    )
}
