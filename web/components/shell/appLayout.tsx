import { DeviceSwitcher } from "../deviceSwitcher";
import { useAppState } from "../hooks/useAppState";
import { useAutoConnect } from "../hooks/useAutoConnect";
import { useUIFlag } from "../hooks/useUIFlag";
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

function DeviceBar({ compact }: { compact?: boolean }) {
    return (<div className={cn("px-3 w-full flex items-center justify-center space-x-2 flex-grow",
        compact ? "py-2 h-[2.5rem]" : "py-4 h-[3rem]"
    )}>
        <DeviceSwitcher width='100%' />
    </div>)
}

function SidebarArea({ liquidGlass }: { liquidGlass?: boolean }) {
    const compact = isMacosTheme() && !liquidGlass;
    return (<aside className={cn(
        `sidebar z-20 h-full w-full shrink-0`,
    )}>
        {isMacosTheme() && <div className="app-dragable h-[3rem] w-full"></div>}
        <ScrollArea className={cn(
            isMacosTheme() && " px-1 lg:pr-2",
            isMacosTheme() ? (compact ? "h-[calc(100vh-6rem)]" : "h-[calc(100vh-7rem)]") : "h-[calc(100vh-2.6rem)]",
        )}>
            <div className="h-[1rem] w-full"></div>
            <AppSidebar />
        </ScrollArea>
        {isMacosTheme() && <DeviceBar compact={compact} />}
    </aside>)
}

export function AppLayout({ children }: { children: React.ReactNode }) {

    const { selectedFingerprint } = useAppState();
    useAutoConnect(selectedFingerprint, 'app');

    const { supportLiquidGlass } = useUIFlag();
    const macosLiquidGlass = isMacosTheme() && supportLiquidGlass;

    return (<>
        <div className={`flex-1 items-start md:grid md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]`}>
            {
                macosLiquidGlass ?
                    <div className="h-full w-full p-[0.4rem]">
                        <div className="macos-sidebar-backdrop rounded-[1.2rem]"></div>
                        <div className="fixed top-0 left-0 h-full w-[220px] lg:w-[240px] p-[0.4rem] z-30">
                            <div className="macos-sidebar-strip rounded-[1.2rem] h-full w-full">
                                <SidebarArea liquidGlass />
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
