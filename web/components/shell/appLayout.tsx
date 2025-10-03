import { DeviceSwitcher } from "../deviceSwitcher";
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

export function AppLayout({ children }: { children: React.ReactNode }) {

    return (<>
        <div className={`flex-1 items-start md:grid md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]`}>
            <aside className={cn(
                `sidebar z-20 h-full w-full shrink-0`,
            )}>
                {isMacosTheme() && <div className="app-dragable h-[3rem] w-full"></div>}
                <ScrollArea className={cn(
                    "py-6 pl-1 lg:pr-2",
                    isMacosTheme() ? "h-[calc(100vh-7rem)]" : "h-[calc(100vh-2.6rem)]",
                    )}>
                    <div className='flex justify-start items-center pl-4'>
                    </div>
                    <AppSidebar />
                </ScrollArea>
                {isMacosTheme() && <DeviceBar />}
            </aside>
            <MainContent>
                {children}
            </MainContent>
        </div>
    </>)
}
