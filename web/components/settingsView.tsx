
export function Section({ title, children }: {
    title?: string,
    children: React.ReactNode
}) {
    return (
        <div className='m-2 mb-4 p-1 bg-background rounded-lg shadow-sm mx-auto max-w-2xl md:border md:bg-muted/30 border-slate-100'>
            {title && <h3 className='text-xl font-bold mb-2'>{title}</h3>}
            {children}
        </div>
    )
}

export function PageContainer({ children }: {
    children: React.ReactNode
}) {
    return (
        <div className='bg-slate-100/50 md:bg-inherit px-4 py-3 min-h-[90vh]'>
            {children}
        </div>
    )
}

export function Line({ children, title }: {
    children: React.ReactNode,
    title?: string,
}) {
    return (
        <div className='flex items-center justify-between border-b p-1 min-h-[2.4rem] last-of-type:border-none border-slate-100 text-sm'>
            {
                title && <div className='font-medium'>
                    {title}
                </div>
            }
            <div className='ml-2 text-foreground text-right'>{children}</div>
        </div>
    )
}
