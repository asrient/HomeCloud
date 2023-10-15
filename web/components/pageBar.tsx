import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useAppState, useAppDispatch } from './hooks/useAppState';
import { ActionTypes } from '@/lib/state';
import { useCallback } from 'react';

export default function PageBar({ children, title, icon, hideSidebarButton }: {
    children: React.ReactNode,
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
        <div className='sticky top-0 md:top-[2.6rem] w-full h-[2.8rem] flex justify-between items-center p-1 border-muted bg-background/70 border-b backdrop-blur-lg z-10'>
            <div className='flex justify-center items-center pl-3 md:pl-4'>
                {
                    !hideSidebarButton && !showSidebar && (
                        <Button variant='ghost' size='icon' className='mr-1' title='Show Side Bar' onClick={toggleSidebar}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                        </Button>
                    )
                }
                {
                    icon && typeof icon === 'string' ? (
                        <Image
                            alt={title}
                            src={icon}
                            loading="eager"
                            height={0}
                            width={0}
                            className="mr-2 h-6 w-6"
                        />
                    ) : (<span className='mr-2 text-blue-500'>{icon}</span>)
                }
                <span className='font-semibold truncate'>{title}</span>
            </div>
            <div className='flex justify-center items-center md:space-x-1 pl-3 pr-2 text-blue-600'>
                {children}
            </div>
        </div>
    )
}
