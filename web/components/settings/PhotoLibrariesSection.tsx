import React, { useEffect, useState, useCallback } from 'react';
import { Section, Line } from '@/components/formPrimatives';
import ConfirmModal from '@/components/confirmModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PhotoLibraryLocation } from "shared/types";
import { Folder, Plus, X } from 'lucide-react';
import { getServiceController } from '@/lib/utils';

interface PhotoLibrariesSectionProps {
  fingerprint: string | null;
  isRemote?: boolean;
}

export default function PhotoLibrariesSection({ fingerprint, isRemote }: PhotoLibrariesSectionProps) {
  const [photoLibraries, setPhotoLibraries] = useState<PhotoLibraryLocation[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newLibName, setNewLibName] = useState('');
  const [newLibPath, setNewLibPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchPhotoLibraries = useCallback(async () => {
    try {
      const sc = await getServiceController(fingerprint);
      const locations = await sc.photos.getLocations();
      setPhotoLibraries(locations);
    } catch (e) {
      console.error('Failed to fetch photo libraries:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [fingerprint]);

  useEffect(() => {
    fetchPhotoLibraries();
  }, [fetchPhotoLibraries]);

  const handleAddPhotoLibraryLocal = useCallback(async () => {
    try {
      const localSc = window.modules.getLocalServiceController();
      const result = await localSc.files.openFilePicker(false, true, undefined, 'Select Library Folder', 'Select');
      if (result && result.length > 0) {
        const selectedPath = result[0].path;
        const rawName = selectedPath.split(/[/\\]/).filter(Boolean).pop() || 'Library';
        let folderName: string;
        try { folderName = decodeURIComponent(rawName); } catch { folderName = rawName; }
        const sc = await getServiceController(fingerprint);
        await sc.photos.addLocation(folderName, selectedPath);
        await fetchPhotoLibraries();
      }
    } catch (e) {
      console.error('Failed to add photo library:', e);
    }
  }, [fingerprint, fetchPhotoLibraries]);

  const handleAddPhotoLibraryRemote = useCallback(async () => {
    if (!newLibName.trim() || !newLibPath.trim()) return;
    try {
      const sc = await getServiceController(fingerprint);
      await sc.photos.addLocation(newLibName.trim(), newLibPath.trim());
      await fetchPhotoLibraries();
      setAddDialogOpen(false);
      setNewLibName('');
      setNewLibPath('');
    } catch (e) {
      console.error('Failed to add photo library:', e);
    }
  }, [fingerprint, fetchPhotoLibraries, newLibName, newLibPath]);

  const handleRemovePhotoLibrary = useCallback(async (id: string) => {
    try {
      const sc = await getServiceController(fingerprint);
      await sc.photos.removeLocation(id);
      await fetchPhotoLibraries();
    } catch (e) {
      console.error('Failed to remove photo library:', e);
    }
  }, [fingerprint, fetchPhotoLibraries]);

  return (
    <fieldset disabled={loading || error} className="m-0 p-0 border-0">
    <Section title="Photo Libraries">
      {photoLibraries.map((library) => (
        <Line key={library.id} title={
          <div className="flex items-center">
            <Folder className="w-7 h-7 mr-2 text-foreground/70" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{library.name}</span>
              <span className="text-xs text-foreground/50">{library.location}</span>
            </div>
          </div>
        }>
          <ConfirmModal
            title='Remove Photo Library'
            description={`Are you sure you want to remove "${library.name}" from your photo libraries?`}
            onConfirm={() => handleRemovePhotoLibrary(library.id)}
            buttonVariant='destructive'
            buttonText='Remove'
          >
            <Button variant='ghost' className='text-red-500' size='icon'>
              <X className="w-4 h-4" />
            </Button>
          </ConfirmModal>
        </Line>
      ))}
      {isRemote ? (
        <>
          <Line>
            <Button variant='ghost' className="text-primary" size='sm' onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Photo Library
            </Button>
          </Line>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogContent className="sm:max-w-[24rem]" onPointerDownOutside={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Add Photo Library</DialogTitle>
                <DialogDescription>
                  Enter the folder path on the remote device.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Name</label>
                  <Input
                    placeholder="e.g. Photos"
                    value={newLibName}
                    onChange={(e) => setNewLibName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Folder Path</label>
                  <Input
                    placeholder="e.g. /home/user/photos"
                    value={newLibPath}
                    onChange={(e) => setNewLibPath(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" size="sm" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleAddPhotoLibraryRemote} disabled={!newLibName.trim() || !newLibPath.trim()}>
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Line>
          <Button variant='ghost' className="text-primary" size='sm' onClick={handleAddPhotoLibraryLocal}>
            <Plus className="w-4 h-4 mr-1" />
            Add Photo Library
          </Button>
        </Line>
      )}
    </Section>
    </fieldset>
  );
}
