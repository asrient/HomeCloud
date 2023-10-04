import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRouter } from "next/router";
import ProfilePicture from "../profilePicture";
import { useAppDispatch, useAppState } from "../hooks/useAppState";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import Link from "next/link";
import { Storage } from "@/lib/types";
import { Switch } from "@/components/ui/switch"
import { ActionTypes } from "@/lib/state";

function StorageItem({ storage, isDisabled }: { storage: Storage, isDisabled: boolean }) {
    const dispatch = useAppDispatch();

    const onToggle = (checked: boolean) => {
        dispatch(ActionTypes.TOGGLE_STORAGE, {
            storageId: storage.id,
            disabled: !checked,
        });
    }

    return (
        <div className="p-2 flex rounded-lg hover:bg-muted">
            <Link href={`settings/storage/${storage.id}`} className="flex grow">
                    <div className="flex items-center pr-4">
                    <div className="h-[2rem] w-[2rem] rounded-md bg-slate-500 text-white flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
                        </svg>
                    </div>
                    </div>
                    <div className="grow my-auto font-medium">
                        <div className="text-[0.9rem]">{storage.name}</div>
                        <div className="text-[0.7rem] text-slate-500">{storage.type}</div>
                    </div>
            </Link>
            <Switch
                className="ml-2 my-auto"
                checked={!isDisabled}
                onCheckedChange={onToggle} />
        </div>
    );
}

function AccountPopover() {
    const { profile, storages, disabledStorages } = useAppState();

    if (!profile) return null;

    return (
        <Popover>
            <PopoverTrigger>
                <ProfilePicture profile={profile} size="sm" />
            </PopoverTrigger>
            <PopoverContent sideOffset={5} align="end" className="p-2">
                <div className="flex flex-col space-y-1">
                    <Link href="/settings">
                        <div className="flex rounded-lg hover:bg-muted">
                            <div className="flex items-center pr-4 p-2">
                                <ProfilePicture profile={profile} size="md" />
                            </div>
                            <div className="grow my-auto font-medium">
                                <div className="text-[1rem]">{profile.username || profile.name}</div>
                                <div className="text-[0.7rem] text-slate-500">Profile ID</div>
                            </div>
                        </div>
                    </Link>
                    <hr />
                    <div className="text-[0.7rem] text-slate-600 pl-1">STORAGES</div>
                    {
                        storages?.map((storage) => (
                            <StorageItem key={storage.id} storage={storage} isDisabled={disabledStorages.includes(storage.id)} />
                        ))
                    }
                    <div>
                        <Button className="w-full" variant='outline' size='sm'>
                            Add storage
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

const tabClass = "data-[state=active]:bg-muted data-[state=active]:shadow-none";

export default function AppHeader() {
    const router = useRouter();
    const activeTab = router.pathname.split('/')[1] || 'home';

    const onBack = () => {
        router.back();
    }

    const onTabChange = (value: string) => {
        if (value === 'home') value = '';
        router.push(`/${value}`);
    }

    return (<div className="bg-white flex items-center p-2 text-sm top-0 z-20 relative md:sticky border-b-[1px] border-slate-100 border-solid">
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
                    <TabsTrigger className={tabClass} value="notes" disabled>
                        Notes
                    </TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
        <div className="ml-auto md:mr-1">
            <AccountPopover />
        </div>
    </div>)
}
