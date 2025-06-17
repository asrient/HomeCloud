import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRouter } from "next/router";
import { useAppDispatch, useAppState } from "../hooks/useAppState";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link";
import { NextUrl, Storage, StorageType } from "@/lib/types";
import { Switch } from "@/components/ui/switch"
import { ActionTypes } from "@/lib/state";
import AddStorageModal from "../addStorageModal";
import {
    DialogTrigger,
} from "@/components/ui/dialog";
import { deviceIdFromFingerprint, getName, getIconUrlFromType, getUrlFromIconKey } from "@/lib/storageConfig";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { settingsUrl } from "@/lib/urls";
import Image from "next/image";
import AddAgentModal from "../addAgentModal";


const addIcon = (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
</svg>);

function EmptyPlaceholder({
    iconUrl,
    text,
}: {
    iconUrl: string;
    text: string;
}) {
    return (<div className="flex space-y-1 p-2 flex-col w-full justify-center items-center text-foreground/60 text-xs">
        <div>
            <Image src={iconUrl} alt="Empty" height={55} width={55} />
        </div>
        <div>{text}</div>
    </div>)
}

const tabClass = "data-[state=active]:bg-primary/90 data-[state=active]:shadow-none data-[state=active]:text-white text-xs rounded-sm";

export default function AppHeader() {
    const router = useRouter();
    const [isRouterBusy, setIsRouterBusy] = useState(false);
    const activeTab = router.pathname.split('/')[1] || 'home';

    const onBack = () => {
        router.back();
    }

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
        <div className="flex items-center px-2 py-1 h-[2.6rem] text-sm top-0 z-20 relative md:fixed w-full app-dragable">
            <div className="grow max-w-[8rem] md:flex items-center justify-center hidden">
                <Button size='sm' variant='ghost' className="text-primary app-nodrag" onClick={onBack}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    Back
                </Button>
            </div>
            <div className="flex items-center md:pl-3">
                <Tabs value={activeTab} onValueChange={onTabChange} className="h-full space-y-6 app-nodrag">
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
                        <TabsTrigger className={tabClass} value="dev">
                            Debug
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
        </div>
        <div className="md:h-[2.6rem]"></div>
    </>)
}
