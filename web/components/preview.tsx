import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useMemo, useState } from 'react'
import { getDefaultIcon, getFileUrl } from '@/lib/fileUtils';
import Image from 'next/image';
import { Button } from './ui/button';
import { ArrowUpOnSquareIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { FileRemoteItem } from './filesView';
import { toast } from './ui/use-toast';
import LoadingIcon from './ui/loadingIcon';

function PreviewBar({ item, close }: { item: FileRemoteItem, close: () => void }) {
    const icon = useMemo(() => getDefaultIcon(item), [item]);
    const [openingInApp, setOpeningInApp] = useState(false);

    const openInApp = useCallback(async () => {
        if (openingInApp) return;
        setOpeningInApp(true);
        if (!item.deviceFingerprint) return;
        try {
            // open file locally
            const serviceController = window.modules.getLocalServiceController();
            await serviceController.files.openFile(item.deviceFingerprint, item.path);
        } catch (e: any) {
            console.error(e);
            toast({
                title: 'Could not open file',
                description: e.message,
            })
        } finally {
            setOpeningInApp(false);
        }
    }, [item.deviceFingerprint, item.path, openingInApp]);

    return (
        <div className='bg-background text-s border-b bottom-1'>
            <div className='flex items-center p-1 px-3 space-x-2 pl-10 no-drag'>
                <Button variant='secondary' size='icon' className='rounded-full p-1' onClick={close}>
                    <ArrowLeftIcon className="h-5 w-5" />
                </Button>
                <div className='pl-[5rem]'></div>
                <Button onClick={openInApp} variant='default' disabled={openingInApp} size='sm'>
                    {
                        openingInApp ?
                            <LoadingIcon className='h-5 w-5 mr-1' />
                            :
                            <ArrowUpOnSquareIcon className='h-5 w-5 mr-1' />
                    }
                    Open
                </Button>
                <div className='flex items-center space-x-2 pl-[3rem]'>
                    <Image height={20} width={20} src={icon} alt='Item icon' />
                    <div className='text-foreground font-medium'>{item.name}</div>
                </div>
            </div>
        </div>
    )
}

function PreviewContent({ item }: { item: FileRemoteItem }) {
    const assetUrl = useMemo<string>(() => getFileUrl(item.deviceFingerprint, item.path), [item]);
    const contentType = useMemo(() => item.mimeType?.split('/')[0], [item]);

    if (assetUrl && contentType === 'image') {
        return (<div className='w-full h-full'>
            <Image src={assetUrl} height={0} width={0} className='w-full h-full object-scale-down' alt='Preview image' />
        </div>)
    }

    if (assetUrl && contentType === 'video') {
        return (<div className='w-full h-full'>
            <video src={assetUrl} controls className='w-full h-full' />
        </div>)
    }

    if (assetUrl && contentType === 'audio') {
        return (<div className='w-full h-full flex justify-center items-center'>
            <audio src={assetUrl} controls className='w-[35rem] max-w-full' />
        </div>)
    }

    if (assetUrl && (item.mimeType === 'application/pdf' || item.mimeType === 'application/epub+zip' || contentType === 'text' || item.mimeType === 'application/json')) {
        return (<embed src={assetUrl} className='w-full h-full' />)
    }

    return (<div className='w-full h-full'>
        <div className='h-full flex justify-center items-center'>Preview not available.</div>
    </div>)
}

export default function PreviewModal({
    item,
    close,
}: {
    item: FileRemoteItem | null,
    close: () => void,
}) {

    const handleOpenChange = useCallback((open: boolean) => {
        if (!open && item) {
            close();
        }
    }, [close, item]);

    return (
        <Dialog.Root open={!!item} onOpenChange={handleOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay />
                <Dialog.Content
                    className='fixed top-0 h-screen w-screen z-30 bg-background duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'>
                    {item && (<>
                        <PreviewBar item={item} close={close} />
                        <PreviewContent item={item} />
                    </>)}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
