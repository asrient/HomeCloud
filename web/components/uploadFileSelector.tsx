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

export type UploadFileSelectorProps = {
    title: string,
    children?: React.ReactNode,
    onUpload: (files: FileList) => Promise<void>,
    accept?: string,
    embedComponent?: React.ReactNode,
};

export default function UploadFileSelector({ title, children, onUpload, accept, embedComponent }: UploadFileSelectorProps) {
    const [files, setFiles] = useState<FileList | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(e.target.files);
        }
    }, []);

    const handleUpload = useCallback(async () => {
        if (!files) return;
        setIsUploading(true);
        setError(null);
        try {
            await onUpload(files);
            setDialogOpen(false);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setFiles(null);
            setIsUploading(false);
        }
    }, [files, onUpload]);

    return (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen} >
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[28rem]">
                <DialogHeader className="md:flex-row">
                    <div className="flex items-center justify-center p-1 md:pr-4">
                        <div className="h-[3rem] w-[3rem] rounded-md bg-blue-500 text-white flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                            </svg>
                        </div>
                    </div>
                    <div className="grow flex-col flex justify-center">
                        <DialogTitle>
                            {title}
                        </DialogTitle>
                        <DialogDescription>
                            {error ? <span className='text-red-500'>{error}</span> : 'Select files to upload.'}
                        </DialogDescription>
                    </div>
                </DialogHeader>
                <Separator />
                <>
                    {
                        embedComponent && <div className='mb-4'>
                            {embedComponent}
                        </div>
                    }
                    {!isUploading && <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="Files">Choose</Label>
                        <Input accept={accept} onChange={handleFileChange} id="Files" type="file" multiple />
                    </div>}

                    {isUploading && <div className="flex justify-center items-center">
                        <LoadingIcon />
                        <span className='ml-2'>Uploading...</span>
                    </div>}

                    <div className='ml-auto'>
                        {<Button variant='default' disabled={isUploading || !files || !files.length} onClick={handleUpload}>Upload</Button>}
                    </div>
                </>
            </DialogContent>
        </Dialog>
    );
}
