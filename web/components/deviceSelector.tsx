import { useState, useEffect, useCallback, useMemo } from 'react';
import { PeerCandidate, PeerInfo } from 'shared/types';
import { Button } from './ui/button';
import { getUrlFromIconKey, printFingerprint } from '@/lib/utils';
import Image from 'next/image';
import { usePeerState } from './hooks/usePeerState';
import { cn } from '@/lib/utils';

// Show a small circle indicator for online/offline status
export const OnlineIndicator = ({ isOnline, className }: { isOnline?: boolean, className?: string }) => {
    const indicatorClass = useMemo(() => {
        if (isOnline === undefined) return '';
        return isOnline ? 'bg-green-500' : 'bg-red-500';
    }, [isOnline]);

    return (
        <span className={cn('inline-block w-2 h-2 rounded-full', indicatorClass, className)}></span>
    );
}

export enum DeviceIconSize {
    SMALL = 60,
    MEDIUM = 90,
    LARGE = 120,
    XLARGE = 180,
}

export const DeviceIconWithStatus = ({
    iconKey,
    isOnline,
    className,
    size = DeviceIconSize.MEDIUM
}: {
    iconKey?: string | null;
    isOnline?: boolean;
    className?: string;
    size?: DeviceIconSize;
}) => {
    return (
        <div className={cn('flex items-center justify-center relative', className)} style={{ width: size, height: size }}>
            <Image src={getUrlFromIconKey(iconKey)} width={size} height={size} alt="Device icon" className="object-contain max-w-full max-h-full" />
            <OnlineIndicator isOnline={isOnline} className="absolute bottom-0 right-0" />
        </div>
    );
}

// Alias for backwards compatibility
export const DeviceIcon = DeviceIconWithStatus;

export const DeviceButton = ({
    fingerprint,
    deviceName,
    iconKey,
    onClick,
    isOnline,
}: {
    fingerprint: string;
    deviceName?: string;
    iconKey?: string | null;
    isOnline?: boolean;
    onClick: (fingerprint: string) => void;
}) => {
    return (
        <Button key={fingerprint}
            variant='ghost' className="h-max flex flex-col items-center justify-center rounded-none p-2 w-[8rem]"
            onClick={() => onClick(fingerprint)}>
            <DeviceIconWithStatus iconKey={iconKey} isOnline={isOnline} size={DeviceIconSize.SMALL} className="mb-1" />
            <div className="max-w-[6rem] text-sm text-foreground/70 text-ellipsis truncate">{deviceName || 'Anonymous device'}</div>
            <div className="max-w-[6rem] text-xs text-foreground/40 text-ellipsis truncate">
                {printFingerprint(fingerprint)}
            </div>
        </Button>
    );
};

export function DiscoverDeviceView({
    setSelectedCandidate,
    title,
}: {
    setSelectedCandidate: (candidate: PeerCandidate | null) => void;
    title?: string;
}) {
    const [candidates, setCandidates] = useState<PeerCandidate[] | null>(null);

    const loadCandidates = useCallback(async () => {
        const serviceController = window.modules.getLocalServiceController();
        const foundCandidates = await serviceController.net.getCandidates();
        setCandidates(foundCandidates);
    }, []);

    useEffect(() => {
        loadCandidates();
    }, [loadCandidates]);

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-foreground/70">
                    {title || 'Discover Devices'}
                </div>
                <Button variant='secondary' size='sm' onClick={loadCandidates}>
                    Refresh
                </Button>
            </div>
            <div className=" flex items-center justify-center h-full flex-wrap">
                {
                    candidates === null ?
                        'Looking for devices..'
                        :
                        candidates.length === 0 ?
                            'No devices found.'
                            :
                            candidates.map((candidate) => (
                                <DeviceButton
                                    key={candidate.fingerprint}
                                    fingerprint={candidate.fingerprint}
                                    deviceName={candidate.deviceName}
                                    iconKey={candidate.iconKey}
                                    onClick={() => setSelectedCandidate(candidate)}
                                />
                            ))
                }
            </div>
        </div>
    )
}

export function PeerSelector({
    title,
    setSelectedPeer,
}: {
    title?: string;
    setSelectedPeer: (peerInfo: PeerInfo | null) => void;
}) {
    const peers = usePeerState();

    return (
        <div>
            <div className="text-sm text-foreground/70 mb-2">
                {title || 'My Devices'}
            </div>
            <div className="flex items-center justify-center h-full flex-wrap">
                {
                    peers === null ?
                        'Loading devices..'
                        :
                        peers.length === 0 ?
                            'No devices linked.'
                            :
                            peers.map((peer) => (
                                <DeviceButton
                                    key={peer.fingerprint}
                                    fingerprint={peer.fingerprint}
                                    deviceName={peer.deviceName}
                                    iconKey={peer.iconKey}
                                    isOnline={!!peer.connection}
                                    onClick={() => setSelectedPeer(peer)}
                                />
                            ))
                }
            </div>
        </div>
    )
}
