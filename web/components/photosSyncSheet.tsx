import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { AppName, Storage, SyncState } from "@/lib/types";
import useFilterStorages from "./hooks/useFilterStorages";
import React, { useCallback, useMemo } from "react";
import { useAppDispatch, useAppState } from "./hooks/useAppState";
import { Button } from "./ui/button";
import Image from "next/image";
import { syncPhotos, archivePhotos } from "@/lib/api/photos";
import { ActionTypes } from "@/lib/state";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import LoadingIcon from "./ui/loadingIcon";
import ConfirmModal from "./confirmModal";
import { useToast } from "./ui/use-toast";
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

function StorageCard({ storage, syncState }: { storage: Storage, syncState: SyncState | null }) {
    const dispatch = useAppDispatch();
    const [selectedOption, setSelectedOption] = React.useState<'hardSync' | 'archive' | 'forceHardSync' | null>(null);
    const { toast } = useToast();

    const sync = useCallback(async (type: 'softSync' | 'hardSync', force = false) => {
        if (syncState?.isBusy) return;
        dispatch(ActionTypes.PHOTOS_SYNC_START, {
            storageId: storage.id,
            currentAction: type,
        });
        try {
            await syncPhotos({
                storageId: storage.id,
                hard: type === 'hardSync',
                force,
            });
            dispatch(ActionTypes.PHOTOS_SYNC_STOP, { storageId: storage.id });
        } catch (e: any) {
            dispatch(ActionTypes.PHOTOS_SYNC_STOP, { storageId: storage.id, error: e.message });
            throw e;
        }
    }, [dispatch, storage.id, syncState?.isBusy]);

    const archive = useCallback(async () => {
        if (syncState?.isBusy) return;
        dispatch(ActionTypes.PHOTOS_SYNC_START, {
            storageId: storage.id,
            currentAction: 'archive',
        });
        try {
            await archivePhotos(storage.id);
            dispatch(ActionTypes.PHOTOS_SYNC_STOP, { storageId: storage.id });
        } catch (e: any) {
            dispatch(ActionTypes.PHOTOS_SYNC_STOP, { storageId: storage.id, error: e.message });
            throw e;
        }
    }, [dispatch, storage.id, syncState?.isBusy]);

    const softSync = useCallback(async () => {
        try {
            await sync('softSync')
        } catch (e: any) {
            toast({
                type: 'foreground',
                title: 'Photos Sync Error',
                description: e.message,
                color: 'red',
            });
        }
    }, [sync, toast]);

    const selectHardSync = useCallback(() => setSelectedOption('hardSync'), []);
    const selectForceHardSync = useCallback(() => setSelectedOption('forceHardSync'), []);
    const selectArchive = useCallback(() => setSelectedOption('archive'), []);

    const confirmAction = useCallback(async () => {
        const selectedOption_ = selectedOption;
        switch (selectedOption_) {
            case 'hardSync':
                await sync('hardSync');
                break;
            case 'archive':
                await archive();
                break;
            case 'forceHardSync':
                await sync('hardSync', true);
                break;
        }
    }, [selectedOption, sync, archive]);

    const onDialogOpenChange = useCallback((open: boolean) => {
        if (!open) setSelectedOption(null);
    }, []);

    return (<>
        <ConfirmModal isOpen={!!selectedOption} onOpenChange={onDialogOpenChange}
            title={
                selectedOption === 'hardSync'
                    ? 'Full Refresh'
                    : selectedOption === 'archive'
                        ? 'Archive Changes'
                        : 'Force Refresh'
            }
            description={
                selectedOption === 'hardSync'
                    ? 'If normal refresh is not working, you can perform a full reload of records. This will take a longer time to complete.'
                    : selectedOption === 'archive'
                        ? 'Continue if you are facing performance issue while adding or deleting photos from this location. All other clients that heaven\'t been synced recently will need to perform a Full Refresh.'
                        : 'Force a reload of entire photos data from the remote location. Use this if you think records shown in the app is not accurate even after syncing.'
            }
            buttonText='Continue'
            buttonVariant='secondary'
            onConfirm={confirmAction}>
        </ConfirmModal>
        <div className="py-3 px-2 space-x-2 border-b">
            <div className="flex flex-row items-center">
                <div>
                    <Image src='/icons/ssd.png' alt='Storage icon' className='mr-2' width={40} height={40} />
                </div>
                <div className="flex flex-col grow items-start max-w-[70%]">
                    <div className="text-sm font-semibold text-foreground">{storage.name}</div>
                    <div className="text-xs text-muted-foreground">
                        {
                            syncState?.isBusy
                                ? <div>
                                    {
                                        syncState?.currentAction === 'archive'
                                            ? 'Archiving...'
                                            : syncState?.currentAction === 'hardSync'
                                                ? 'Sync in progress...'
                                                : 'Refreshing...'
                                    }
                                </div>
                                : syncState && syncState.lastSyncedAt ? `updated ${dayjs().to(syncState.lastSyncedAt)}.` : 'Available for refresh.'
                        }
                    </div>
                </div>
                <div>
                    <Button onClick={softSync} title='Refresh' variant='ghost' size='icon' disabled={syncState?.isBusy || syncState?.hardSyncRequired}>
                        {
                            !syncState?.isBusy
                                ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                                : <LoadingIcon />
                        }
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button title='More options' variant='ghost' size='icon'>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                                </svg>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent sideOffset={-5}>
                            <DropdownMenuItem disabled={syncState?.isBusy} onClick={selectHardSync}>Full refresh</DropdownMenuItem>
                            <DropdownMenuItem disabled={syncState?.isBusy} onClick={selectArchive}>Archive changes</DropdownMenuItem>
                            <DropdownMenuItem disabled={syncState?.isBusy || !syncState?.error} onClick={selectForceHardSync}>
                                Force refresh
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            {
                syncState?.error && <div className="text-xs pt-2 text-red-500 break-words">{syncState?.error}</div>
            }
        </div>
    </>)
}

export default function PhotosSyncSheet() {
    const storages = useFilterStorages(AppName.Photos);
    const { photosSyncState } = useAppState();
    const isInProgress = useMemo(() => storages.some(storage => photosSyncState[storage.id]?.isBusy), [storages, photosSyncState]);

    return (<Sheet>
        <SheetTrigger asChild>
            <Button variant='ghost' size='icon' title='Refresh options'>
                {
                    isInProgress
                        ? <LoadingIcon />
                        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                }
            </Button>
        </SheetTrigger>
        <SheetContent>
            <SheetHeader>
                <SheetTitle>Photos Sync</SheetTitle>
                <SheetDescription>
                    Manage and sync photos app data in your storages locations.
                </SheetDescription>
            </SheetHeader>
            <div className='pt-2'>
                {storages.map(storage => <StorageCard key={storage.id} storage={storage} syncState={photosSyncState[storage.id]} />)}
            </div>
        </SheetContent>
    </Sheet>)
}
