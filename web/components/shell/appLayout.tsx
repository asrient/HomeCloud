import { DeviceSwitcher } from "../deviceSwitcher";
import { useAppState } from "../hooks/useAppState";
import { useAutoConnect } from "../hooks/useAutoConnect";
import { ScrollArea } from "../ui/scroll-area";
import { AppSidebar } from "./appSidebar";
import { cn, isMacosTheme } from "@/lib/utils";


export function MainContent({ children }: { children: React.ReactNode }) {
    return (
        <div className={cn(!isMacosTheme() && "md:px-2 md:pb-2 h-full")}>
            <div className={cn(
                "relative overflow-hidden",
                isMacosTheme() && 'bg-background h-screen',
                !isMacosTheme() && 'bg-background/70 shadow md:rounded-md md:h-[calc(100vh_-_2.6rem_-_0.5rem)]'
            )}>
                {children}
            </div>
        </div>
    )
}

function DeviceBar() {
    return (<div className="px-3 py-4 w-full h-[4rem] flex items-center justify-center space-x-2">
        <DeviceSwitcher width='100%' />
    </div>)
}

function SidebarArea() {
    return (<aside className={cn(
        `sidebar z-20 h-full w-full shrink-0`,
    )}>
        {isMacosTheme() && <div className="app-dragable h-[3rem] w-full"></div>}
        <ScrollArea className={cn(
            isMacosTheme() && " px-1 lg:pr-2",
            isMacosTheme() ? "h-[calc(100vh-7.5rem)]" : "h-[calc(100vh-2.6rem)]",
        )}>
            <div className="h-[1rem] w-full"></div>
            <AppSidebar />
        </ScrollArea>
        {isMacosTheme() && <DeviceBar />}
    </aside>)
}

export function AppLayout({ children }: { children: React.ReactNode }) {

    const { selectedFingerprint } = useAppState();
    useAutoConnect(selectedFingerprint, 'app');

    return (<>
        <div className={`flex-1 items-start md:grid md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]`}>
            {
                isMacosTheme() ?
                    <div className="h-full w-full p-[0.4rem]">
                        <div className="macos-sidebar-backdrop rounded-[1.2rem]"></div>
                        <div className="fixed top-0 left-0 h-full w-[220px] lg:w-[240px] p-[0.4rem] z-30">
                            <div className="macos-sidebar-strip rounded-[1.2rem] h-full w-full">
                                <SidebarArea />
                            </div>
                        </div>
                    </div>
                    : <SidebarArea />
            }
            <MainContent>
                {children}
            </MainContent>
        </div>
    </>)
}
