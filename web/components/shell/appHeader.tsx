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
import { deviceIdFromFingerprint, getName, getStorageIconUrl } from "@/lib/storageConfig";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { settingsUrl } from "@/lib/urls";
import Image from "next/image";

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
        return getStorageIconUrl(storage.type); // fix: (storage.type, storage.agent?.deviceInfo)
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
                                    {storage.agent?.remoteProfileName}
                                    <span className="p-1">•</span>
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

function DevicesPopover() {
    const { profile, storages, disabledStorages, serverConfig } = useAppState();
    const [settingsUrl_, setSettingsUrl_] = useState<NextUrl | null>(null);

    useEffect(() => {
        setSettingsUrl_(settingsUrl());
    }, []);

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

    if (!profile) return null;

    return (
        <AddStorageModal>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant='secondary' title="My Devices" size='sm' className={cn(nonLocalActiveStorageCount === 0 && 'border-2 border-red-400')}>
                        <Image src="/icons/devices.png" alt="Devices" height={20} width={20} />
                        {nonLocalActiveStorageCount > 0 && (<span className="ml-2 text-slate-500 text-xs">{nonLocalActiveStorageCount}</span>)}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[20rem]" align="end" forceMount>
                            <div className="flex p-2 pt-4 pb-4 items-center justify-center">
                                <div className="flex pr-3">
                                <Image src={getStorageIconUrl(StorageType.Local)} alt="This device" className="pr-2" height={80} width={80} />
                                </div>
                                <div className="font-medium">
                                <div className="text-[0.6rem] leading-tight text-slate-500">THIS DEVICE</div>
                                    <div className="text-[0.9rem]">{serverConfig?.deviceName}</div>
                                    <div className="text-[0.7rem] leading-tight text-slate-500">
                                        {profile.name}
                                        <span className="p-1">•</span>
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
                    <DialogTrigger asChild>
                        <DropdownMenuItem asChild>
                            <Button variant='outline' size='sm' className='w-full mt-1 mb-1'>
                                {addIcon}
                                Add device
                            </Button>
                        </DropdownMenuItem>
                    </DialogTrigger>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Cloud Storages</DropdownMenuLabel>
                    {
                        cloudStorages?.map((storage) => (
                            <DropdownMenuItem key={storage.id}>
                                <StorageItem storage={storage} isDisabled={disabledStorages.includes(storage.id)} />
                            </DropdownMenuItem>
                        ))
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
        </AddStorageModal>);
}

const tabClass = "data-[state=active]:bg-muted data-[state=active]:shadow-none";

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
        <div className="bg-background flex items-center px-2 py-1 h-[2.6rem] text-sm top-0 z-20 relative md:fixed w-full border-b-[1px] border-solid">
            <div className="grow max-w-[8rem] md:flex items-center justify-center hidden">
                <Button size='sm' variant='ghost' onClick={onBack}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    Back
                </Button>
            </div>
            <div className="flex items-center md:pl-3">
                <Tabs value={activeTab} onValueChange={onTabChange} className="h-full space-y-6">
                    <TabsList className="bg-background">
                        <TabsTrigger className={tabClass} value="home">
                            Home
                        </TabsTrigger>
                        <TabsTrigger className={tabClass} value="photos">
                            Photos
                        </TabsTrigger>
                        <TabsTrigger className={tabClass} value="notes">
                            Notes
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
