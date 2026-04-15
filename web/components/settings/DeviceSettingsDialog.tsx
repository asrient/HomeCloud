import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PeerInfo } from "shared/types";
import AISettingsSection from './AISection';
import PhotoLibrariesSection from './PhotoLibrariesSection';

interface DeviceSettingsDialogProps {
  fingerprint: string;
  peer: PeerInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DeviceSettingsDialog({ fingerprint, peer, open, onOpenChange }: DeviceSettingsDialogProps) {
  const deviceName = peer?.deviceName ?? 'Device';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{deviceName} Settings</DialogTitle>
          <DialogDescription>
            Remotely manage settings for your device.
          </DialogDescription>
        </DialogHeader>
        <div className="pb-6">
          <PhotoLibrariesSection fingerprint={fingerprint} isRemote />
          <AISettingsSection fingerprint={fingerprint} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
