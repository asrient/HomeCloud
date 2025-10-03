import { PeerInfo } from "shared/types";
import { usePeerState } from "./hooks/usePeerState";
import { getUrlFromIconKey, printFingerprint } from "@/lib/utils";
import Image from 'next/image';
import { useCallback, useState } from "react";
import { useAppState } from "./hooks/useAppState";
import { useNavigation } from "./hooks/useNavigation";
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import AddPeerModal from "./addPeerModal";

export const DeviceItem = ({
    fingerprint,
    deviceName,
    iconKey,
}: {
    fingerprint: string | null;
    deviceName?: string;
    iconKey?: string | null;
    isOnline?: boolean;
}) => {
    return (
        <div
            className="w-max flex items-center justify-center">
            <Image src={getUrlFromIconKey(iconKey)} width={16} height={16} alt="Device icon" className='mr-2' />
            <div className="text-sm text-foreground/70 text-ellipsis truncate">{deviceName || 'Anonymous device'}</div>
            {fingerprint && <div className="text-sm text-foreground/40 text-ellipsis truncate ml-2">
                {printFingerprint(fingerprint)}
            </div>}
        </div>
    );
};

export function DeviceSwitcher({
    width = '10rem',
}: {
    width?: string;
}) {
    const peers = usePeerState();
    const { selectedFingerprint } = useAppState();
    const { openDevicePage } = useNavigation();
    const [isAddPeerModalOpen, setIsAddPeerModalOpen] = useState(false);

    const selectedPeer = peers.find(peer => peer.fingerprint === selectedFingerprint);

    const onCheckedChange = useCallback((fingerprint: string | null) => {
        return (checked: boolean) => {
            if (checked) {
                openDevicePage(fingerprint);
            }
        }
    }, [openDevicePage]);

    return (
        <>
            <AddPeerModal isOpen={isAddPeerModalOpen} onOpenChange={(val) => setIsAddPeerModalOpen(val)} />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size='sm' style={{ width }}>
                        <Image src={getUrlFromIconKey(selectedPeer?.iconKey)} width={16} height={16} alt="Device icon" className='mr-2' />
                        {selectedPeer ? (selectedPeer.deviceName || 'Anonymous device') : 'This Device'}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent style={{ width }} align="center">
                    <DropdownMenuCheckboxItem
                        checked={selectedFingerprint === null}
                        onCheckedChange={onCheckedChange(null)}
                    >
                        <DeviceItem fingerprint={null} deviceName='This Device' iconKey={null} />
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    {peers.map(peer => (
                        <DropdownMenuCheckboxItem
                            key={peer.fingerprint}
                            checked={selectedFingerprint === peer.fingerprint}
                            onCheckedChange={onCheckedChange(peer.fingerprint)}
                        >
                            <DeviceItem
                                fingerprint={peer.fingerprint}
                                deviceName={peer.deviceName}
                                iconKey={peer.iconKey}
                            />
                        </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuItem onSelect={() => setIsAddPeerModalOpen(true)}>
                        Add device...
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    )
}
