import { useCallback, useMemo, useState } from 'react'
import { getDefaultIcon, getFileUrl } from '@/lib/fileUtils';
import Image from 'next/image';
import { Button } from './ui/button';
import { FileRemoteItem } from '@/lib/types';
import { toast } from './ui/use-toast';
import LoadingIcon from './ui/loadingIcon';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

function PreviewBar({ item }: { item: FileRemoteItem | null }) {
    const icon = useMemo(() => item ? getDefaultIcon(item) : null, [item]);
    const [openingInApp, setOpeningInApp] = useState(false);

    const openInApp = useCallback(async () => {
        if (openingInApp) return;
        if (!item) return;
        setOpeningInApp(true);
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
    }, [item, openingInApp]);

    return (
        <div className='text-sm flex items-center justify-between space-x-2 mr-6'>
            <div className='flex items-center space-x-2'>
                {icon && <Image height={20} width={20} src={icon} alt='Item icon' />}
                <DialogTitle className='text-sm'>{item?.name || 'Preview'}</DialogTitle>
            </div>
            <div className='flex items-center space-x-2'>
                <Button onClick={openInApp} variant='default' disabled={openingInApp} size='sm'>
                    {openingInApp ? <LoadingIcon className='h-5 w-5' /> : 'Open'}
                </Button>
            </div>
        </div>
    )
}

function PreviewContent({ item }: { item: FileRemoteItem }) {
    const assetUrl = useMemo<string>(() => getFileUrl(item.deviceFingerprint, item.path), [item]);
    const contentType = useMemo(() => item.mimeType?.split('/')[0], [item]);

    if (assetUrl && contentType === 'image') {
        return (
            <Image src={assetUrl} height={0} width={0} className='w-auto h-auto object-contain object-center' alt='Preview image' />)
    }

    if (assetUrl && contentType === 'video') {
        return (
            <video src={assetUrl} controls className='w-auto h-auto object-contain object-center' />
        )
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
        <Dialog open={!!item} onOpenChange={handleOpenChange}>
            <DialogContent
                className='max-w-3xl lg:max-w-4xl xl:max-w-6xl h-[85vh] max-h-[50rem] overflow-hidden py-0 px-0 gap-0 flex flex-col'>
                <DialogHeader className='py-3 px-4 h-min'>
                    <PreviewBar item={item} />
                </DialogHeader>
                <div className='w-full h-full overflow-auto'>
                    {item && <PreviewContent item={item} />}
                </div>
            </DialogContent>
        </Dialog>
    )
}
