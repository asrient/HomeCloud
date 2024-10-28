import { useCallback, useEffect, useState } from "react";
import LoadingIcon from "./ui/loadingIcon";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { importPhotos } from "@/lib/api/photos";
import { FileRemoteItem } from "./filesView";
import Image from 'next/image';

export default function ImportPhotosModal({ isOpen, onOpenChange, files }: {
    files: FileRemoteItem[],
    onOpenChange: (open: boolean) => void,
    isOpen: boolean,
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [deleteSource, setDeleteSource] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setError(null);
            setIsLoading(false);
        }
    }, [isOpen]);

    const performImport = useCallback(async () => {
        const actionMap: { [storageId: number]: string[] } = {};
        files.forEach((file) => {
            if (!file.storageId) return;
            if (!actionMap[file.storageId]) {
                actionMap[file.storageId] = [];
            }
            actionMap[file.storageId].push(file.id);
        });
        const actions = Object.entries(actionMap).map(([storageId, ids]) => {
            return importPhotos({
                storageId: parseInt(storageId),
                fileIds: ids,
                deleteSource,
            });
        });
        const results = await Promise.all(actions);
        const errorList: string[] = [];
        results.forEach((result) => {
            const { errors } = result;
            Object.keys(errors).forEach((key) => {
                errorList.push(`${key}: ${errors[key]}`);
            });
        });
        if (errorList.length) {
            throw new Error(errorList.join('\n'));
        }
    }, [deleteSource, files]);

    const handleSubmit = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            await performImport();
            if (isOpen) {
                onOpenChange(false);
            }
        } catch (e: any) {
            if (isOpen) {
                setError(e.message);
            }
        } finally {
            if (isOpen) {
                setIsLoading(false);
            }
        }
    }, [isOpen, onOpenChange, performImport]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange} >
            <DialogContent className="sm:max-w-[20rem]">
                <DialogHeader>
                    <div className='flex items-center justify-start'>
                        <Image src='/icons/photos.png' alt='Photos Icon' width={40} height={40} className='mr-2' />
                        <DialogTitle>
                            {`Import ${files.length} Photo${files.length > 1 ? 's' : ''}`}
                        </DialogTitle>
                    </div>
                    <DialogDescription>
                        {error && <span className='text-red-500'>{error}</span>}
                    </DialogDescription>
                </DialogHeader>
                <>
                    {isLoading && <div className="flex justify-center items-center">
                        <LoadingIcon />
                        <span className='ml-2'>Importing...</span>
                    </div>}

                    {!isLoading && <div className='p-2 py-3 text-sm text-foreground flex flex-row items-center'>
                        <input
                            id='delSourceCheckBox'
                            className='mr-2'
                            type='checkbox'
                            checked={deleteSource}
                            onChange={(e) => setDeleteSource(e.target.checked)} />
                        <label htmlFor='delSourceCheckBox'>Delete files after import</label>
                    </div>}

                    <div className='flex justify-center items-center space-x-2'>
                        <Button variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        {<Button type='submit' size='lg' variant='default' disabled={isLoading} onClick={handleSubmit}>
                            Import
                        </Button>}
                    </div>
                </>
            </DialogContent>
        </Dialog>
    );
}
