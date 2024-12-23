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

function StorageItem({ storage, isDisabled }: { storage: Storage, isDisabled: boolean }) {
    const dispatch = useAppDispatch();

    const onToggle = (checked: boolean) => {
        dispatch(ActionTypes.TOGGLE_STORAGE, {
            storageId: storage.id,
            disabled: !checked,
        });
    }

    const onToggleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    }

    const iconUrl = useMemo(() => {
        if (storage.type === StorageType.Agent) {
            return getUrlFromIconKey(storage.agent?.iconKey);
        }
        return getIconUrlFromType(storage.type);
    }, [storage]);

    return (
        <div className="flex w-full">
            <Link href={`/settings/storage?id=${storage.id}`} className="flex grow cursor-default">
                <Image src={iconUrl} alt="Storage" className="pr-2" height={60} width={60} />

                <div className="grow my-auto font-medium">
                    <div className="text-[0.8rem] text-slate-600 truncate text-ellipsis max-w-[16rem]">{storage.name}</div>
                    <div className="text-xs text-slate-500 font-normal">
                        {
                            storage.type === StorageType.Agent ?
                                (<span>
                                    {deviceIdFromFingerprint(storage.agent!.fingerprint)}
                                </span>) :
                                getName(storage.type)
                        }
                    </div>


                </div>
            </Link>
            <Switch
                className="ml-2 my-auto"
                checked={!isDisabled}
                onClick={onToggleClick}
                onCheckedChange={onToggle} />
        </div>
    );
}

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

function DevicesPopover() {
    const { storages, disabledStorages, serverConfig, iconKey, isAuthenticated } = useAppState();
    const [settingsUrl_, setSettingsUrl_] = useState<NextUrl | null>(null);
    const [addAgentModalOpen, setAddAgentModalOpen] = useState(false);

    useEffect(() => {
        setSettingsUrl_(settingsUrl());
    }, []);

    const firstAddShownRef = useRef(false);
    useEffect(() => {
        if (!Array.isArray(storages)) return;
        if (storages.length <= 1 && !firstAddShownRef.current) {
            setAddAgentModalOpen(true);
        }
        firstAddShownRef.current = true;
    }, [storages]);

    const nonLocalActiveStorageCount = useMemo(() => {
        let count = storages?.length || 0;
        if (storages) {
            count--; // Exclude the local storage
            count -= disabledStorages.length;
            const local = storages.find(s => s.type === StorageType.Local);
            if (local && disabledStorages.includes(local.id)) {
                count++;
            }
        }
        return count;
    }, [disabledStorages, storages]);

    const devices = useMemo(() => {
        return storages?.filter(s => s.type === StorageType.Agent) || [];
    }, [storages]);

    const cloudStorages = useMemo(() => {
        return storages?.filter(s => s.type !== StorageType.Agent && s.type !== StorageType.Local) || [];
    }, [storages]);

    const deviceIconUrl = useMemo(() => {
        return getUrlFromIconKey(iconKey);
    }, [iconKey]);

    if (!isAuthenticated) return null;

    return (
        <>
            <AddStorageModal>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant='secondary' title="My Devices" size='sm' className={cn(nonLocalActiveStorageCount === 0 && 'border-2 border-red-400', 'bg-foreground/10')}>
                            <Image src="/icons/devices.png" alt="Devices" height={20} width={20} />
                            {nonLocalActiveStorageCount > 0 && (<span className="ml-2 text-slate-500 text-xs">{nonLocalActiveStorageCount}</span>)}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[20rem]" align="end" forceMount>
                        <div className="flex p-2 pt-4 pb-4 items-center justify-center">
                            <div className="flex pr-2">
                                <Image src={deviceIconUrl} alt="This device" className="pr-2" height={85} width={85} />
                            </div>
                            <div className="font-medium">
                                <div className="text-[0.6rem] leading-tight text-slate-500">THIS DEVICE</div>
                                <div className="text-[0.9rem]">{serverConfig?.deviceName}</div>
                                <div className="text-[0.7rem] leading-tight text-slate-500">
                                    {deviceIdFromFingerprint(serverConfig?.fingerprint || '')}
                                </div>
                            </div>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>My Devices</DropdownMenuLabel>
                        {
                            devices?.map((storage) => (
                                <DropdownMenuItem key={storage.id}>
                                    <StorageItem storage={storage} isDisabled={disabledStorages.includes(storage.id)} />
                                </DropdownMenuItem>
                            ))
                        }
                        {
                            devices?.length === 0 &&
                            <EmptyPlaceholder iconUrl="/icons/connect-devices.png" text="Connect all your Mac, Windows and more." />
                        }
                        <DropdownMenuItem asChild>
                            <Button onClick={() => setAddAgentModalOpen(true)}
                                variant='outline' size='sm' className='w-full mt-1 mb-1'>
                                {addIcon}
                                Add device
                            </Button>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Cloud Storages</DropdownMenuLabel>
                        {
                            cloudStorages?.map((storage) => (
                                <DropdownMenuItem key={storage.id}>
                                    <StorageItem storage={storage} isDisabled={disabledStorages.includes(storage.id)} />
                                </DropdownMenuItem>
                            ))
                        }
                        {
                            cloudStorages?.length === 0 &&
                            <EmptyPlaceholder iconUrl="/icons/cloud-gray.png" text="Connect your Google Drive, OneDrive and more." />
                        }
                        <DialogTrigger asChild>
                            <DropdownMenuItem asChild>
                                <Button variant='outline' size='sm' className='w-full mt-1'>
                                    {addIcon}
                                    Add storage
                                </Button>
                            </DropdownMenuItem>
                        </DialogTrigger>

                    </DropdownMenuContent>
                </DropdownMenu>
            </AddStorageModal>
            <AddAgentModal
                isOpen={addAgentModalOpen}
                setOpenChange={setAddAgentModalOpen} />
        </>);
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
        <div className="flex items-center px-2 py-1 h-[2.6rem] text-sm top-0 z-20 relative md:fixed w-full">
            <div className="grow max-w-[8rem] md:flex items-center justify-center hidden">
                <Button size='sm' variant='ghost' className="text-primary" onClick={onBack}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    Back
                </Button>
            </div>
            <div className="flex items-center md:pl-3">
                <Tabs value={activeTab} onValueChange={onTabChange} className="h-full space-y-6">
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
                        <TabsTrigger className={cn(tabClass, 'hidden sm:block')} value="settings">
                            Settings
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            <div className="ml-auto md:mr-1">
                <DevicesPopover />
            </div>
        </div>
        <div className="md:h-[2.6rem]"></div>
    </>)
}
