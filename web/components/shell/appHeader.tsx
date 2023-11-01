import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRouter } from "next/router";
import ProfilePicture from "../profilePicture";
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
import { NextUrl, Storage } from "@/lib/types";
import { Switch } from "@/components/ui/switch"
import { ActionTypes } from "@/lib/state";
import AddStorageModal from "../addStorageModal";
import {
    DialogTrigger,
} from "@/components/ui/dialog";
import { getName } from "@/lib/storageConfig";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { settingsUrl } from "@/lib/urls";

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

    return (
        <div className="flex w-full">
            <Link href={`/settings/storage?id=${storage.id}`} className="flex grow cursor-default">
                <div className="flex items-center pr-4">
                    <div className="h-[2rem] w-[2rem] rounded-md bg-slate-500 text-white flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
                        </svg>
                    </div>
                </div>
                <div className="grow my-auto font-medium">
                    <div className="text-[0.9rem]">{storage.name}</div>
                    <div className="text-[0.7rem] text-slate-500">{getName(storage.type)}</div>
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

function AccountPopover() {
    const { profile, storages, disabledStorages } = useAppState();
    const [settingsUrl_, setSettingsUrl_] = useState<NextUrl | null>(null);

    useEffect(() => {
        setSettingsUrl_(settingsUrl());
    }, []);

    if (!profile) return null;

    return (
        <AddStorageModal>
            <DropdownMenu>
                <DropdownMenuTrigger>
                    <ProfilePicture profile={profile} size="sm" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[16rem]" align="end" forceMount>
                    <Link href="/settings/profile">
                        <DropdownMenuItem>
                            <div className="flex">
                                <div className="flex items-center pr-3">
                                    <ProfilePicture profile={profile} size="sm" />
                                </div>
                                <div className="grow my-auto font-medium">
                                    <div className="text-[0.9rem]">{profile.username || profile.name}</div>
                                    <div className="text-[0.7rem] leading-tight text-slate-500">Profile Settings</div>
                                </div>
                            </div>
                        </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Storages</DropdownMenuLabel>
                    {
                        storages?.map((storage) => (
                            <DropdownMenuItem key={storage.id}>
                                <StorageItem storage={storage} isDisabled={disabledStorages.includes(storage.id)} />
                            </DropdownMenuItem>
                        ))
                    }
                    <DropdownMenuSeparator />
                    <DialogTrigger asChild>
                        <DropdownMenuItem>
                            Add storage..
                        </DropdownMenuItem>
                    </DialogTrigger>
                    <Link href={settingsUrl_ || '/'}>
                        <DropdownMenuItem>Settings</DropdownMenuItem>
                    </Link>
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
                        <TabsTrigger className={tabClass} value="files">
                            Files
                        </TabsTrigger>
                        <TabsTrigger className={tabClass} value="notes">
                            Notes
                        </TabsTrigger>
                        <TabsTrigger className={cn(tabClass, 'hidden sm:block')} value="settings">
                            Settings
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            <div className="ml-auto md:mr-1">
                <AccountPopover />
            </div>
        </div>
        <div className="md:h-[2.6rem]"></div>
    </>)
}
