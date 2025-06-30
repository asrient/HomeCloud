import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import Image from 'next/image';
import { ScrollArea } from "./ui/scroll-area";
import { DiscoverDeviceView, PeerSelector } from "./deviceSelector";

export type Device = {
    deviceName: string,
    fingerprint: string,
    iconKey: string | null,
}

export default function DeviceSelectorModal({ setModal, onSelect, isOpen, showNearbyDevices }: {
    setModal: (open: boolean) => void,
    onSelect: (device: Device) => void,
    isOpen: boolean,
    showNearbyDevices: boolean,
}) {
    return (
        <Dialog open={isOpen} onOpenChange={setModal} >
            <DialogContent className="sm:max-w-[26rem]">
                <DialogHeader>
                    <div className='flex items-center justify-start'>
                        <Image src='/icons/devices.png' alt='Devices Icon' width={40} height={40} className='mr-2' />
                        <DialogTitle>
                            Select a device
                        </DialogTitle>
                    </div>
                </DialogHeader>
                <div className="min-h-[10rem]">

                    <ScrollArea>
                        {showNearbyDevices && (
                            <DiscoverDeviceView title="Nearby Devices" setSelectedCandidate={(candidate) => {
                                if(!candidate) return;
                                onSelect({
                                    deviceName: candidate.deviceName || 'Unknown Device',
                                    fingerprint: candidate.fingerprint,
                                    iconKey: candidate.iconKey || null,
                                });
                            }} />
                        )}
                        <PeerSelector setSelectedPeer={(device) => {
                            if (!device) return;
                            onSelect({
                                deviceName: device.deviceName,
                                fingerprint: device.fingerprint,
                                iconKey: device.iconKey || null,
                            });
                        }} />
                    </ScrollArea>

                </div>
            </DialogContent>
        </Dialog>
    );
}
