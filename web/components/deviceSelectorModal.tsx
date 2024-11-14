import { useCallback, useEffect, useMemo, useState } from "react";
import LoadingIcon from "./ui/loadingIcon";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import Image from 'next/image';
import useAgentCandidates from "./hooks/useAgentCandidates";
import { useAppState } from "./hooks/useAppState";
import { AgentCandidate, AgentInfo, Profile, StorageType } from "@/lib/types";
import { getAgentInfo } from "@/lib/api/discovery";
import { ProfileSelector } from "./addAgentModal";
import { ScrollArea } from "./ui/scroll-area";
import { getUrlFromIconKey } from "@/lib/storageConfig";

export type Device = {
    storageId?: number,
    name: string,
    fingerprint: string,
    profileId: number,
    iconKey?: string,
}

export default function DeviceSelectorModal({ setModal, onSelect, isOpen, showNearbyDevices }: {
    setModal: (open: boolean) => void,
    onSelect: (device: Device) => void,
    isOpen: boolean,
    showNearbyDevices: boolean,
}) {
    const { candidates, error: nearbyDevicesError } = useAgentCandidates(isOpen && showNearbyDevices);
    const { storages } = useAppState();

    const myDevices: Device[] = useMemo(() => {
        if (!storages) {
            return [];
        }
        const agentStorages = storages.filter((storage) => storage.type === StorageType.Agent && storage.agent);
        return agentStorages.map((storage) => ({
            storageId: storage.id,
            name: storage.name,
            fingerprint: storage.agent!.fingerprint,
            profileId: storage.agent!.profileId,
            iconKey: storage.agent?.iconKey,
        }));
    }, [storages]);

    const [selectedAgentCandidate, setSelectedAgentCandidate] = useState<AgentCandidate | null>(null);
    const screen = useMemo(() => selectedAgentCandidate ? 'profile-select' : 'device-select', [selectedAgentCandidate]);

    const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
    const [profileSelectError, setProfileSelectError] = useState<string | null>(null);

    const fetchAgentInfo = useCallback(async () => {
        if (!selectedAgentCandidate) {
            return;
        }
        try {
            const agentInfo = await getAgentInfo(selectedAgentCandidate);
            setAgentInfo(agentInfo);
            if (agentInfo.availableProfiles.length === 1) {
                onSelect({
                    name: agentInfo.deviceName,
                    fingerprint: agentInfo.fingerprint,
                    profileId: agentInfo.availableProfiles[0].id,
                });
                setModal(false);
            }
        } catch (e: any) {
            setProfileSelectError(e.message);
        }
    }, [onSelect, selectedAgentCandidate, setModal]);

    useEffect(() => {
        if (!showNearbyDevices || !isOpen) {
            setSelectedAgentCandidate(null);
            setAgentInfo(null);
        }
    }, [isOpen, showNearbyDevices]);

    const selectAgentCandidate = useCallback((candidate: AgentCandidate) => {
        setSelectedAgentCandidate(candidate);
        setProfileSelectError(null);
        fetchAgentInfo();
    }, [fetchAgentInfo]);

    return (
        <Dialog open={isOpen} onOpenChange={setModal} >
            <DialogContent className="sm:max-w-[26rem]">
                <DialogHeader>
                    <div className='flex items-center justify-start'>
                        <Image src='/icons/devices.png' alt='Devices Icon' width={40} height={40} className='mr-2' />
                        <DialogTitle>
                            {screen === 'device-select' ? 'Select a device' : 'Select profile to continue'}
                        </DialogTitle>
                    </div>
                </DialogHeader>
                <div className="min-h-[10rem]">
                    {
                        screen === 'profile-select' ?
                            (
                                agentInfo ?
                                    <ScrollArea>
                                        <ProfileSelector
                                            profiles={agentInfo.availableProfiles}
                                            showTitle={false}
                                            onSelect={(profile: Profile) => {
                                                onSelect({
                                                    name: agentInfo.deviceName,
                                                    fingerprint: agentInfo.fingerprint,
                                                    profileId: profile.id,
                                                });
                                                setModal(false);
                                            }}
                                        />
                                    </ScrollArea>
                                    : <LoadingIcon className="mt-10" />
                            )
                            :
                            <ScrollArea>
                                {showNearbyDevices && (<>
                                    <div className="py-1 px-1 text-base font-medium">Nearby Devices</div>
                                    {candidates ? (
                                        <>
                                            {candidates.map((candidate) => (
                                                <Button key={candidate.fingerprint}
                                                    variant='ghost'
                                                    onClick={() => selectAgentCandidate(candidate)} className="w-full border-t rounded-none justify-start py-5">
                                                    <Image src={getUrlFromIconKey(candidate.iconKey)} alt='device icon' width={30} height={30} className='mr-2' />
                                                    {candidate.deviceName}
                                                </Button>
                                            ))}
                                            {nearbyDevicesError && (
                                                <DialogDescription className="text-red-500 text-center">{nearbyDevicesError}</DialogDescription>
                                            )}
                                        </>
                                    ) : (
                                        <LoadingIcon className="mt-10" />
                                    )}
                                </>)}
                                <div className="py-2 px-1 text-base font-medium">My Devices</div>
                                {myDevices.map((device) => (
                                    <Button variant='ghost' key={device.storageId} onClick={() => onSelect(device)} className="w-full border-t rounded-none justify-start py-5">
                                        <Image src={getUrlFromIconKey(device.iconKey)} alt='device icon' width={30} height={30} className='mr-2' />
                                        {device.name}
                                    </Button>
                                ))}
                                {
                                    myDevices.length === 0 && (
                                        <DialogDescription className="text-center">
                                            No devices found.
                                        </DialogDescription>
                                    )
                                }
                            </ScrollArea>
                    }
                </div>
            </DialogContent>
        </Dialog>
    );
}