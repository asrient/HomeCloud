import { useCallback, useEffect, useState } from "react";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
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

export type TextModalProps = {
    title: string,
    children?: React.ReactNode,
    onDone: (newName: string) => Promise<void>,
    defaultValue?: string,
    buttonText?: string,
    fieldName?: string,
    description?: string,
    onOpenChange?: (open: boolean) => void,
    isOpen?: boolean,
    noTrigger?: boolean,
    additionalContent?: React.ReactNode,
    textType?: 'text' | 'password',
}

export default function TextModal({ title, buttonText, children, onDone, defaultValue, fieldName, description, isOpen, onOpenChange, noTrigger, additionalContent, textType }: TextModalProps) {
    fieldName = fieldName || 'Name';
    const [text, setText] = useState<string>(defaultValue || '');
    const [isDirty, setIsDirty] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(isOpen || false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen === undefined) return;
        setDialogOpen(isOpen);
    }, [isOpen]);

    useEffect(() => {
        if (!dialogOpen) {
            setText('');
            setError(null);
            setIsLoading(false);
            setIsDirty(false);
        }
    }, [dialogOpen]);

    useEffect(() => {
        if (!dialogOpen) return;
        if (isDirty) {
            setError(null);
        }
    }, [isDirty, dialogOpen]);

    useEffect(() => {
        if (!dialogOpen) return;
        if (defaultValue && !isDirty) {
            setText(defaultValue);
        }
    }, [defaultValue, dialogOpen, isDirty]);

    const handleOpenChange = useCallback((open: boolean) => {
        if (onOpenChange) {
            onOpenChange(open);
        } else {
            setDialogOpen(open);
        }
    }, [onOpenChange]);

    const handleSubmit = useCallback(async () => {
        if (!text) return;
        setIsLoading(true);
        setError(null);
        try {
            await onDone(text);
            if (dialogOpen) {
                handleOpenChange(false);
            }
        } catch (e: any) {
            if (dialogOpen) {
                setError(e.message);
            }
        } finally {
            if (dialogOpen) {
                setText('');
                setIsDirty(false);
                setIsLoading(false);
            }
        }
    }, [text, onDone, handleOpenChange, dialogOpen]);

    const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);
        setIsDirty(true);
    }, []);

    return (
        <Dialog open={dialogOpen} onOpenChange={handleOpenChange} >
            {
                !noTrigger
                    ? (<DialogTrigger asChild>
                        {children}
                    </DialogTrigger>)
                    : (<>{children}</>)
            }
            <DialogContent className="max-w-[20rem]">
                <DialogHeader>
                    <DialogTitle>
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {error ? <span className='text-red-500'>{error}</span> : description}
                    </DialogDescription>
                </DialogHeader>
                <>
                    {!isLoading && (<>
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <Label>{fieldName}</Label>
                            <Input onChange={handleNameChange} value={text} type={textType || "text"} />
                        </div>
                        {additionalContent}
                    </>)}

                    {isLoading && <div className="flex justify-center items-center">
                        <LoadingIcon />
                        <span className='ml-2'>Loading...</span>
                    </div>}

                    <div className="flex justify-center items-center">
                        <Button type='submit' variant='default' size='lg' disabled={isLoading || !text} onClick={handleSubmit}>
                            {buttonText || 'Save'}
                        </Button>
                    </div>
                </>
            </DialogContent>
        </Dialog>
    );
}
