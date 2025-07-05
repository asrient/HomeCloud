import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useAppState, useAppDispatch } from './hooks/useAppState';
import { ActionTypes } from '@/lib/state';
import { useCallback } from 'react';

export default function PageBar({ children, title, icon, hideSidebarButton }: {
    children?: React.ReactNode,
    title: string,
    icon?: string | React.ReactNode,
    hideSidebarButton?: boolean,
}) {

    const { showSidebar } = useAppState();
    const dispatch = useAppDispatch();

    const toggleSidebar = useCallback(() => {
        dispatch(ActionTypes.TOGGLE_SIDEBAR, {
            showSidebar: !showSidebar,
        })
    }, [dispatch, showSidebar]);

    return (
        <div className='sticky top-0 w-full min-h-[3.5rem] flex justify-between items-center px-3 py-1 z-10'>
            <div className='flex justify-center items-center bg-background/80 backdrop-blur-md rounded-full shadow-xl p-0.5 px-2'>
                {
                    !hideSidebarButton && !showSidebar && (
                        <Button variant='ghost' size='icon' className='text-primary/90' title='Show menu' onClick={toggleSidebar}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25" />
                            </svg>
                        </Button>
                    )
                }
                <div className='flex items-center space-x-2 py-2 px-1'>
                    {
                        icon && typeof icon === 'string' ? (
                            <Image
                                alt={title}
                                src={icon}
                                loading="eager"
                                height={0}
                                width={0}
                                className="h-6 w-6"
                            />
                        ) : icon
                    }
                    <span className='font-medium truncate text-base text-foreground'>{title}</span>
                </div>
            </div>
            {children && (<div className='flex justify-center items-center md:space-x-1 bg-background/80 backdrop-blur-md rounded-full text-primary/90 shadow-xl p-1'>
                {children}
            </div>)}
        </div>
    )
}
