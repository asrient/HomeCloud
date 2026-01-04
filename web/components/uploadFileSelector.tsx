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
import { Button } from "./ui/button";
import { FileList_ } from "@/lib/types";
import { Folder } from "lucide-react";

export type UploadFileSelectorProps = {
    title: string,
    children?: React.ReactNode,
    onUpload: (files: FileList_) => Promise<void>,
    accept?: string,
    embedComponent?: React.ReactNode,
    description?: string,
};

export default function UploadFileSelector({ title, children, onUpload, accept, embedComponent, description }: UploadFileSelectorProps) {
    const [files, setFiles] = useState<FileList_ | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(e.target.files as FileList_);
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
            <DialogContent className="sm:max-w-[20rem]">
                <DialogHeader className="md:flex-row">
                    <div className="flex items-center justify-center p-1 md:pr-3">
                        <div className="h-[3rem] w-[3rem] rounded-md bg-blue-500 text-white flex items-center justify-center">
                            <Folder size={32} />
                        </div>
                    </div>
                    <div className="grow flex-col flex justify-center">
                        <DialogTitle>
                            {title}
                        </DialogTitle>
                        <DialogDescription>
                            {error ? <span className='text-red-500'>{error}</span> : (description || 'Select files to upload.')}
                        </DialogDescription>
                    </div>
                </DialogHeader>
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

                    <div className="flex justify-center items-center">
                        {<Button variant='default' size='lg' disabled={isUploading || !files || !files.length} onClick={handleUpload}>Upload</Button>}
                    </div>
                </>
            </DialogContent>
        </Dialog>
    );
}
