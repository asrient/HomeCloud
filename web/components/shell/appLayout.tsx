import { useAppState } from "../hooks/useAppState";
import { ScrollArea } from "../ui/scroll-area";
import { FilesSidebar } from "./sidebar";

export function AppLayout({ children, sidebarType }: { children: React.ReactNode, sidebarType: string }) {
    const { showSidebar } = useAppState();

    return (<div>
        <div className={`flex-1 items-start ${showSidebar && 'md:grid md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]'}`}>
            <aside className={`fixed top-0 md:top-[2.6rem] z-10 -ml-2 hidden h-[calc(100vh-3.5rem)] w-full shrink-0 md:sticky ${showSidebar ? 'md:block' : 'md:hidden'}`}>
                <ScrollArea className="h-full py-6 pl-1 lg:pl-3 lg:pr-2">
                    {
                        sidebarType === 'files'
                            ? <FilesSidebar />
                            : <div>{sidebarType} Nav</div>
                    }
                </ScrollArea>
            </aside>
            <div className="lg:border-l border-muted min-h-full">
                {children}
            </div>
        </div>
    </div>)
}
