import { StorageType, Storage, StorageMeta } from "@/lib/types";
import StorageForm from "./storageForm";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import React, { use, useEffect, useState } from "react";
import { useAppDispatch, useAppState } from "./hooks/useAppState";
import { Separator } from "@/components/ui/separator";
import { getName } from "@/lib/storageConfig";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { serviceScan } from "@/lib/api/storage";
import { ActionTypes } from "@/lib/state";

function StorageTypeSelector({
    onSelect,
}: {
    onSelect: (storageType: StorageType) => void;
}) {
    const { serverConfig } = useAppState();
    const storageTypes = serverConfig?.storageTypes;

    if (!serverConfig) return null;
    return (<div>
        {storageTypes?.map((storageType, index) => (
            <Button variant='ghost' key={storageType} className={
                "w-full flex rounded-none"
                + (index !== 0 ? " border-t border-solid" : "")
            } onClick={() => onSelect(storageType)}>
                {getName(storageType)}
            </Button>)
        )}
    </div>)
}

function StoragePreferences({
    storage,
    onDone,
}: {
    storage: Storage;
    onDone: () => void;
}) {
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [storageMeta, setStorageMeta] = React.useState<StorageMeta | null>(storage.storageMeta);

    const dispatch = useAppDispatch();

    const onDone_ = () => {
        setError(null);
        setIsLoading(false);
        onDone();
    }

    const onEnable = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { storageMeta } = await serviceScan({
                storageId: storage.id,
            });
            console.log(storageMeta);
            dispatch(ActionTypes.ADD_STORAGE_META, { storageId: storage.id, storageMeta });
            setStorageMeta(storageMeta);
            onDone_();
        } catch (e: any) {
            setError(e.message);
            setIsLoading(false);
        }
    }

    // modify entry point to show storage apps toggles
    useEffect(() => {
        if (storageMeta) {
            onDone_();
        }
    }, [storageMeta]);

    return (<div className='flex flex-col justify-center'>
        <div className='text-lg font-medium'>
            Enable HomeCloud services for "{storage.name}"?
        </div>
        <div className='text-sm pt-3 text-slate-500'>
            To make some features work, we will create a HomeCloud folder in your storage.
        </div>
        <div className='p-1'>
            {error && <div className='text-red-500 text-xs'>{error}</div>}
        </div>
        <div className='flex justify-end pt-4'>
            <Button disabled={isLoading} variant='default' className='ml-2' onClick={onEnable}>Enable</Button>
            <Button variant='outline' className='ml-2' onClick={onDone_}>Not now</Button>
        </div>
    </div>)
}

function SuccessScreen({
    storage,
    onClose,
}: {
    storage: Storage;
    onClose: () => void;
}) {
    return (
        <div>
            <div className='flex items-center justify-center p-4'>
                <div className="text-green-500">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                    </svg>
                </div>
                <div className='font-medium pl-1 text-sm'>
                    {storage.name}
                </div>
            </div>
            <div className='flex justify-end'>
                <Button variant='default' className='ml-2' onClick={onClose}>Done</Button>
            </div>
        </div>)
}

export default function AddStorageModal({
    children,
}: {
    children: React.ReactNode;
}) {
    const [selectedStorageType, setSelectedStorageType] = useState<StorageType | null>(null);
    const [addedStorage, setAddedStorage] = useState<Storage | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [screen, setScreen] = useState<'select' | 'form' | 'preference' | 'success'>('select');
    const dispatch = useAppDispatch();

    const backToBegining = () => {
        setAddedStorage(null);
        setSelectedStorageType(null);
        setScreen('select');
    }

    const selectStorageType = (storageType: StorageType) => {
        setSelectedStorageType(storageType);
        setAddedStorage(null);
        setScreen('form');
    }

    const storageAdded = (storage: Storage) => {
        dispatch(ActionTypes.ADD_STORAGE, { storage });
        setAddedStorage(storage);
        setScreen('preference');
    }

    const showSuccessScreen = () => {
        if (addedStorage) {
            setScreen('success');
        }
    }

    const closeDialog = () => {
        setDialogOpen(false);
        backToBegining();
    }

    return (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen} >
            {children}
            <DialogContent className="sm:max-w-[28rem]">
                <DialogHeader className="md:flex-row">
                    <div className="flex items-center justify-center p-1 md:pr-4">
                        <div className="h-[3rem] w-[3rem] rounded-md bg-purple-500 text-white flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
                            </svg>
                        </div>
                    </div>
                    <div className="grow flex-col flex justify-center">
                        <DialogTitle>{
                            screen === 'success'
                                ? "Success"
                                : screen === 'preference'
                                    ? "Storage Preferences"
                                    : screen === 'form' && selectedStorageType
                                        ? getName(selectedStorageType)
                                        : "Add Storage"
                        }</DialogTitle>
                        <DialogDescription>
                            {
                                screen === 'success'
                                    ? `"${addedStorage?.name}" was added successfully.`
                                    : screen === 'preference'
                                        ? 'Configure this storage to suit your needs.'
                                        : screen === 'form' && selectedStorageType
                                            ? `Connect ${getName(selectedStorageType)} to HomeCloud.`
                                            : 'Select the type of storage you want to add.'
                            }
                        </DialogDescription>
                    </div>
                </DialogHeader>
                <Separator />
                <ScrollArea className="md:max-h-[70vh]">
                    <div className="px-[1px]">
                        {
                            screen === 'success' && addedStorage
                                ? (<SuccessScreen storage={addedStorage} onClose={closeDialog} />)
                                : screen === 'preference' && addedStorage
                                    ? (<StoragePreferences onDone={showSuccessScreen} storage={addedStorage} />)
                                    : screen === 'form' && selectedStorageType
                                        ? (<StorageForm onSuccess={storageAdded}
                                            onCancel={backToBegining}
                                            storageType={selectedStorageType} />) :
                                        (<StorageTypeSelector onSelect={selectStorageType} />)
                        }
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
