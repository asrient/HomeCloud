import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { settingsUrl } from "@/lib/urls";


const addIcon = (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
</svg>);

const tabClass = "data-[state=active]:bg-primary/90 data-[state=active]:shadow-none data-[state=active]:text-white text-xs rounded-sm";

export default function AppHeader() {
    const router = useRouter();
    const [isRouterBusy, setIsRouterBusy] = useState(false);
    const activeTab = router.pathname.split('/')[1] || 'home';

    const onBack = () => {
        router.back();
    }

    const isDev = useMemo(() => {
        return window.modules.config.IS_DEV;
    }, [])

    const onTabChange = useCallback(async (value: string) => {
        if (value === 'home') value = '';
        if (isRouterBusy) return;
        setIsRouterBusy(true);
        if (value === 'settings') {
            await router.push(settingsUrl());
        } else {
            await router.push(`/${value}`);
        }
        setIsRouterBusy(false);
    }, [router, isRouterBusy]);

    return (<>
        <div className="flex items-center px-2 py-1 h-[2.6rem] text-sm app-titlebar select-none">
            <div className="flex items-center">
                <Button size='sm' variant='ghost' className="text-primary" onClick={onBack}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    Back
                </Button>
                <Tabs value={activeTab} onValueChange={onTabChange} className="h-full space-y-6 ml-2">
                    <TabsList className="bg-transparent">
                        <TabsTrigger className={tabClass} value="home">
                            Home
                        </TabsTrigger>
                        <TabsTrigger className={tabClass} value="photos">
                            Photos
                        </TabsTrigger>
                        <TabsTrigger className={tabClass} value="files">
                            Files
                        </TabsTrigger>
                        <TabsTrigger className={tabClass} value="settings">
                            Settings
                        </TabsTrigger>
                        {isDev && (<TabsTrigger className={tabClass} value="dev">
                            Debug
                        </TabsTrigger>)}
                    </TabsList>
                </Tabs>
            </div>
            <div className="grow h-full w-full app-dragable">
            </div>
        </div>
        <div className="md:h-[2.6rem]"></div>
    </>)
}
