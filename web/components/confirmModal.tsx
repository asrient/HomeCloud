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

export default function ConfirmModal({ title, buttonText, children, onConfirm, description, isOpen, onOpenChange, buttonVariant }: {
    title: string,
    children?: React.ReactNode,
    onConfirm: () => Promise<void>,
    buttonText?: string,
    description?: string,
    onOpenChange?: (open: boolean) => void,
    isOpen?: boolean,
    buttonVariant?: "default" | "link" | "destructive" | "outline" | "secondary" | "ghost",
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(isOpen || false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen === undefined) return;
        setDialogOpen(isOpen);
    }, [isOpen]);

    useEffect(() => {
        if (!dialogOpen) {
            setError(null);
            setIsLoading(false);
        }
    }, [dialogOpen]);

    const handleOpenChange = useCallback((open: boolean) => {
        if (onOpenChange) {
            onOpenChange(open);
        } else {
            setDialogOpen(open);
        }
    }, [onOpenChange]);

    const handleSubmit = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            await onConfirm();
            if (dialogOpen) {
                handleOpenChange(false);
            }
        } catch (e: any) {
            if (dialogOpen) {
                setError(e.message);
            }
        } finally {
            if (dialogOpen) {
                setIsLoading(false);
            }
        }
    }, [onConfirm, handleOpenChange, dialogOpen]);

    const buttonVariant_ = buttonVariant || "default";

    return (
        <Dialog open={dialogOpen} onOpenChange={handleOpenChange} >
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[20rem]">
                <DialogHeader>
                    <DialogTitle>
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {error ? <span className='text-red-500'>{error}</span> : description || 'Are you sure?'}
                    </DialogDescription>
                </DialogHeader>
                <>
                    {isLoading && <div className="flex justify-center items-center">
                        <LoadingIcon />
                        <span className='ml-2'>Loading...</span>
                    </div>}

                    <div className='space-x-2 flex justify-center items-center'>
                        <Button variant='secondary' className='w-full' size='lg' onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        {<Button type='submit' size='lg' className='w-full' variant={buttonVariant_} disabled={isLoading} onClick={handleSubmit}>
                            {buttonText || 'Confirm'}
                        </Button>}
                    </div>
                </>
            </DialogContent>
        </Dialog>
    );
}
