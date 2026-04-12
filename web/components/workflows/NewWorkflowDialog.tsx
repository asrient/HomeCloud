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
import { Label } from '@/components/ui/label';
import { FolderOpen } from 'lucide-react';

const DEFAULT_DIR = '~/Workflows';

export function NewWorkflowDialog({ open, onClose, onCreate, fingerprint }: {
    open: boolean;
    onClose: () => void;
    onCreate: (name: string, dir?: string) => void;
    fingerprint: string | null;
}) {
    const [name, setName] = useState('');
    const [dir, setDir] = useState('');
    const [showDirField, setShowDirField] = useState(false);
    const isLocal = fingerprint === null;

    const reset = useCallback(() => {
        setName('');
        setDir('');
        setShowDirField(false);
    }, []);

    const handleCreate = useCallback(() => {
        const trimmed = name.trim();
        if (!trimmed) return;
        onCreate(trimmed, dir.trim() || undefined);
        reset();
    }, [name, dir, onCreate, reset]);

    const handleBrowse = useCallback(async () => {
        try {
            const localSc = window.modules.getLocalServiceController();
            const result = await localSc.files.openFilePicker(false, true, undefined, 'Select Workflows Directory', 'Select');
            if (result && result.length > 0) {
                setDir(result[0].path);
                setShowDirField(true);
            }
        } catch { }
    }, []);

    const displayDir = dir || DEFAULT_DIR;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
            <DialogContent className="sm:max-w-[24rem]">
                <DialogHeader>
                    <DialogTitle>New Workflow</DialogTitle>
                    <DialogDescription>
                        Give your workflow a name to get started.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3 py-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="wf-name">Name</Label>
                        <Input
                            id="wf-name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="My Awesome Workflow"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">

                        {!showDirField ? (
                            <div className="text-xs flex justify-between items-center">
                                <span className='text-muted-foreground'>Saved at: {displayDir}</span>
                                <Button variant="ghost" size="sm" className='text-primary'
                                    onClick={() => isLocal ? handleBrowse() : setShowDirField(true)}>
                                    Change
                                </Button>
                            </div>
                        ) : (<>
                                <Label>Location</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="wf-dir"
                                        value={dir}
                                        onChange={e => setDir(e.target.value)}
                                        placeholder={DEFAULT_DIR}
                                        className="flex-1 text-xs"
                                    />
                                    {isLocal && (
                                        <Button variant="secondary" size="icon" onClick={handleBrowse} title="Browse">
                                            <FolderOpen className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            </>)}
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="platform" onClick={() => { onClose(); reset(); }}>
                        Cancel
                    </Button>
                    <Button size="platform" onClick={handleCreate} disabled={!name.trim()}>
                        Create
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
