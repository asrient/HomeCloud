import { StorageType, Storage } from "@/lib/types";
import StorageForm from "./storageForm";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "./hooks/useAppState";
import { Separator } from "@/components/ui/separator";
import { cloudStorageTypes, getName, getStorageIconUrl } from "@/lib/storageConfig";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { ActionTypes } from "@/lib/state";
import Image from "next/image";

function StorageTypeSelector({
    onSelect,
}: {
    onSelect: (storageType: StorageType) => void;
}) {
    const { serverConfig } = useAppState();

    const availableTypes = useMemo(() => {
        const storageTypes = serverConfig?.storageTypes;
        if (!storageTypes) return [];
        return storageTypes.filter(type => {
            return cloudStorageTypes.includes(type);
        });
    }, [serverConfig?.storageTypes]);

    if (!serverConfig) return null;
    return (<div>
        {availableTypes.map((storageType, index) => (
            <Button variant='ghost' key={storageType} className={
                "w-full flex rounded-none max-w-none pt-10 pb-10 justify-start"
                + (index !== 0 ? " border-t border-solid" : "")
            } onClick={() => onSelect(storageType)}>
                <div className="w-[2rem]">
                </div>
                <Image src={getStorageIconUrl(storageType)} className="mr-2" alt={getName(storageType)} width={40} height={40} />
                {getName(storageType)}
                
            </Button>)
        )}
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
            <div className="flex justify-center items-center">
                <Button variant='default' size='lg' className='ml-2' onClick={onClose}>Done</Button>
            </div>
        </div>)
}

export default function AddStorageModal({
    children,
    existingStorage,
    isOpen,
    onOpenChange,
}: {
    children: React.ReactNode;
    existingStorage?: Storage;
    isOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
}) {
    const [selectedStorageType, setSelectedStorageType] = useState<StorageType | null>(null);
    const [addedStorage, setAddedStorage] = useState<Storage | null>(null);
    const [dialogOpen, setDialogOpen] = useState(isOpen || false);
    const [screen, setScreen] = useState<'select' | 'form' | 'success'>('select');
    const dispatch = useAppDispatch();

    const onOpenChange_ = useCallback((isOpen: boolean) => {
        if (onOpenChange) {
            onOpenChange(isOpen);
        } else {
            setDialogOpen(isOpen);
        }
    }, [onOpenChange]);

    useEffect(() => {
        if (isOpen !== undefined) {
            setDialogOpen(isOpen);
        }
    }, [isOpen]);

    useEffect(() => {
        if (existingStorage && screen === 'select') {
            setSelectedStorageType(existingStorage.type);
            setScreen('form');
        }
    }, [existingStorage, screen]);

    const backToBegining = useCallback(() => {
        setAddedStorage(null);
        if (!existingStorage) {
            setSelectedStorageType(null);
            setScreen('select');
        } else {
            setSelectedStorageType(existingStorage.type);
            setScreen('form');
        }
    }, [existingStorage])

    const selectStorageType = useCallback((storageType: StorageType) => {
        setSelectedStorageType(storageType);
        setAddedStorage(null);
        setScreen('form');
    }, []);

    const storageAdded = useCallback((storage: Storage) => {
        if (existingStorage) {
            console.log('update storage', storage);
            dispatch(ActionTypes.UPDATE_STORAGE, { storage, storageId: existingStorage.id });
        } else {
            dispatch(ActionTypes.ADD_STORAGE, { storage });
        }
        setAddedStorage(storage);
        setScreen('success');
    }, [dispatch, existingStorage]);

    const closeDialog = useCallback(() => {
        onOpenChange_(false);
    }, [onOpenChange_]);

    useEffect(() => {
        if (!dialogOpen) {
            backToBegining();
        }
    }, [backToBegining, dialogOpen]);

    return (
        <Dialog open={dialogOpen} onOpenChange={onOpenChange_} >
            {children}
            <DialogContent className="sm:max-w-[28rem]">
                <DialogHeader className="md:flex-row">
                    <div className="flex items-center justify-center p-1 md:pr-4">
                        {selectedStorageType ?
                            <Image src={getStorageIconUrl(selectedStorageType)} alt={getName(selectedStorageType)} width={48} height={48} /> :
                            <div className="h-[3rem] w-[3rem] rounded-md bg-purple-500 text-white flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
                                </svg>
                            </div>}
                    </div>
                    <div className="grow flex-col flex justify-center">
                        <DialogTitle>{
                            screen === 'success'
                                ? "Success"
                                : screen === 'form' && selectedStorageType
                                    ? getName(selectedStorageType)
                                    : "Add Storage"
                        }</DialogTitle>
                        <DialogDescription>
                            {
                                screen === 'success'
                                    ? `"${addedStorage?.name}" was ${existingStorage ? 'modified' : 'added'} successfully.`
                                    : screen === 'form'
                                        ? 'Connect storage to HomeCloud.'
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
                                : screen === 'form' && selectedStorageType
                                    ? (<StorageForm onSuccess={storageAdded}
                                        onCancel={backToBegining}
                                        existingStorage={existingStorage}
                                        storageType={selectedStorageType} />) :
                                    (<StorageTypeSelector onSelect={selectStorageType} />)
                        }
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
