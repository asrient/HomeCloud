import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { FolderOpen } from 'lucide-react';

export function NewChatDialog({ open, onClose, onCreate, fingerprint }: {
    open: boolean;
    onClose: () => void;
    onCreate: (cwd?: string) => void;
    fingerprint: string | null;
}) {
    const [cwd, setCwd] = useState('');

    const handleCreate = useCallback(() => {
        onCreate(cwd.trim() || undefined);
        setCwd('');
    }, [cwd, onCreate]);

    const handleBrowse = useCallback(async () => {
        try {
            const localSc = window.modules.getLocalServiceController();
            const result = await localSc.files.openFilePicker(false, true, undefined, 'Select Working Directory', 'Select');
            if (result && result.length > 0) {
                setCwd(result[0].path);
            }
        } catch { }
    }, []);

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setCwd(''); } }}>
            <DialogContent className="sm:max-w-[24rem]">
                <DialogHeader>
                    <DialogTitle>New Chat</DialogTitle>
                    <DialogDescription>
                        Choose a working directory for this chat.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-2">
                    <div className="flex w-full gap-2">
                        <Input
                            value={cwd}
                            onChange={e => setCwd(e.target.value)}
                            placeholder="~/AI"
                            className="flex-1"
                        />
                        {fingerprint === null &&<Button variant="secondary" size="icon" onClick={handleBrowse} title="Browse">
                            <FolderOpen className="w-4 h-4" />
                        </Button>}
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="platform" onClick={() => { onClose(); setCwd(''); }}>
                        Cancel
                    </Button>
                    <Button size="platform" onClick={handleCreate}>
                        Start Chat
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
