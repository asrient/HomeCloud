import { cn, isMacosTheme } from "@/lib/utils"
import { ChevronRightIcon } from "@heroicons/react/24/outline"

export function Section({ title, children }: {
    title?: string,
    children: React.ReactNode
}) {
    return (
        <div className="m-2 mb-4 p-1 mx-auto max-w-2xl">
        {title && <h3 className='text-xs font-semibold my-3'>{title}</h3>}
        <div className={cn('p-1 border',
            isMacosTheme() ? 'rounded-lg border-border/30' : 'rounded-sm border-border/70 dark:border-border/20',
            isMacosTheme() ? 'bg-muted/40 dark:bg-muted/20' : 'bg-background dark:bg-muted/20'
        )}>
            {children}
        </div>
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
    children: React.ReactNode,
    title?: string,
}) {
    return (
        <div className={cn('flex items-center justify-between border-b last-of-type:border-none border-border',
            isMacosTheme() ? 'text-xs min-h-[2.4rem] p-1' : 'text-sm min-h-[3.5rem] p-3 dark:border-black/30',
        )}>
            {
                title && <div className='font-regular'>
                    {title}
                </div>
            }
            <div className='ml-2 text-foreground text-right select-text'>{children}</div>
        </div>
    )
}

export function LineLink({ text, color }: {
    text: string,
    color?: 'blue' | 'red' | 'default',
}) {

    let textColor = 'text-foreground/70';

    switch (color) {
        case 'blue':
            textColor = 'text-blue-500';
            break;
        case 'red':
            textColor = 'text-red-500';
            break;
        default:
            break;
    }

    return (
        <div className={cn('flex items-center justify-end hover:bg-muted p-1 rounded-md select-none text-xs', textColor)}>
            <span>{text}</span>
            <ChevronRightIcon className='h-4 w-4 ml-1' />
        </div>
    )
}

//export function 