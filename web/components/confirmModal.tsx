import { useCallback, useEffect, useMemo, useState } from "react";
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
import { cn, isMacosTheme, isWin11Theme, truncateMiddle } from "@/lib/utils";
import { useUIFlag } from "./hooks/useUIFlag";

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

    const { supportLiquidGlass } = useUIFlag();

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

    const displayTitle = useMemo(() => truncateMiddle(title, isWin11Theme() ? 40 : 30), [title]);

    return (
        <Dialog open={dialogOpen} onOpenChange={handleOpenChange} >
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className={cn(
                "overflow-hidden",
                isMacosTheme() && 'bg-popover/80 backdrop-blur-sm backdrop-saturate-150',
                isWin11Theme() ? 'sm:max-w-[26rem] ' : 'sm:max-w-[20rem]'
            )}>
                <DialogHeader>
                    <DialogTitle>
                        {displayTitle}
                    </DialogTitle>
                    {
                        (description || error)
                        && <DialogDescription className='break-words [word-break:break-word]'>
                            {error ? <span className='text-red-500'>{error}</span> : description}
                        </DialogDescription>
                    }
                </DialogHeader>
                <>
                    {isLoading && <div className="flex justify-center items-center">
                        <LoadingIcon />
                        <span className='ml-2'>Loading...</span>
                    </div>}

                    <div className='space-x-2 flex justify-center items-center'>
                        <Button
                            useGlass={false}
                            variant='secondary' size='platform' stretch onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type='submit'
                            useGlass={false}
                            size='platform' variant={buttonVariant_} disabled={isLoading} onClick={handleSubmit} stretch>
                            {buttonText || 'Confirm'}
                        </Button>
                    </div>
                </>
            </DialogContent>
        </Dialog>
    );
}
