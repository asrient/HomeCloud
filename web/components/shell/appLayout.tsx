import { useCallback } from "react";
import { useAppDispatch, useAppState } from "../hooks/useAppState";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { FilesSidebar } from "./filesSidebar";
import { ActionTypes } from "@/lib/state";
import { PhotosSidebar } from "./photosSidebar";
import { SettingsSidebar } from "./settingsSidebar";

export function AppLayout({ children, sidebarType }: { children: React.ReactNode, sidebarType: string }) {
    const { showSidebar } = useAppState();
    const dispatch = useAppDispatch();

    const hideSidebar = useCallback(() => {
        dispatch(ActionTypes.TOGGLE_SIDEBAR, {
            showSidebar: false,
        })
    }, [dispatch]);

    return (<div>
        <div className={`flex-1 items-start ${showSidebar && 'md:grid md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]'}`}>
            <aside className={`sidebar fixed top-0 md:top-[2.6rem] z-10 hidden h-[calc(100vh-2.6rem)] w-full shrink-0 md:sticky ${showSidebar ? 'md:block' : 'md:hidden'}`}>
                <ScrollArea className="h-full py-6 pl-1 lg:pr-2 lg:border-r border-muted">
                    <div className='flex justify-start items-center pl-4'>
                        <Button variant='ghost' size='icon' onClick={hideSidebar} className='text-slate-400' title='Hide Side Bar'>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                            </svg>
                        </Button>
                    </div>
                    {
                        sidebarType === 'files'
                            ? <FilesSidebar />
                            : sidebarType === 'photos'
                                ? <PhotosSidebar />
                                : sidebarType === 'settings'
                                    ? <SettingsSidebar />
                                    : <div>{sidebarType} Nav</div>
                    }
                </ScrollArea>
            </aside>
            <div className="border-muted min-h-full">
                {children}
            </div>
        </div>
    </div>)
}
