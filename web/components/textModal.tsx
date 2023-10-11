import { useCallback, useState } from "react";
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
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";

export default function TextModal({ title, buttonText, children, onDone, defaultValue, fieldName, description }: {
    title: string,
    children?: React.ReactNode,
    onDone: (newName: string) => Promise<void>,
    defaultValue?: string,
    buttonText?: string,
    fieldName?: string,
    description?: string,
}) {
    fieldName = fieldName || 'Name';
    const [text, setText] = useState<string>(defaultValue || '');
    const [isLoading, setIsLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = useCallback(async () => {
        if (!text) return;
        setIsLoading(true);
        setError(null);
        try {
            await onDone(text);
            setDialogOpen(false);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setText('');
            setIsLoading(false);
        }
    }, [text, onDone]);

    const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);
    }, []);

    const handleOpenChange = useCallback((open: boolean) => {
        if (!open) {
            setText('');
            setError(null);
        }
        setDialogOpen(open);
    }, []);

    return (
        <Dialog open={dialogOpen} onOpenChange={handleOpenChange} >
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[28rem]">
                <DialogHeader>
                    <DialogTitle>
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {error ? <span className='text-red-500'>{error}</span> : description || 'Provide a value.'}
                    </DialogDescription>
                </DialogHeader>
                <Separator />
                <>
                    {!isLoading && <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label>{fieldName}</Label>
                        <Input onChange={handleNameChange} value={text} type="text" />
                    </div>}

                    {isLoading && <div className="flex justify-center items-center">
                        <LoadingIcon />
                        <span className='ml-2'>Loading...</span>
                    </div>}

                    <div className='ml-auto'>
                        {<Button type='submit' variant='default' disabled={isLoading || !text} onClick={handleSubmit}>
                            {buttonText || 'Save'}
                        </Button>}
                    </div>
                </>
            </DialogContent>
        </Dialog>
    );
}
