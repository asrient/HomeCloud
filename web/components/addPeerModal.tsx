import {
    Dialog,
    DialogContent,
    DialogFooter,
} from "@/components/ui/dialog";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import SuccessScreen from "./peerAddSuccess";
import { PeerCandidate, PeerInfo } from "shared/types";
import { DialogHeaderView } from "./dialogComponents";
import { DiscoverDeviceView, DeviceIcon } from "./deviceSelector";
import { getUrlFromIconKey } from "@/lib/utils";

const DevicesIcon = () => {
    return (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
    </svg>
    )
}

const SelectorView = ({
    setSelectedCandidate,
}: {
    setSelectedCandidate: (peer: PeerCandidate) => void;
}) => {

    const onCandidateSelected = useCallback((peer: PeerCandidate | null) => {
        if (!peer) {
            return;
        }
        setSelectedCandidate(peer);
    }, [setSelectedCandidate])

    return (
        <>
            <DialogHeaderView
                title='Add your device'
                description='Connect your phones, iPads, PCs, Macbooks.'
                iconView={<DevicesIcon />}
            />
            <Separator />
            <ScrollArea className="md:max-h-[70vh]">
                <DiscoverDeviceView
                    setSelectedCandidate={onCandidateSelected}
                    title="Nearby Devices"
                />
            </ScrollArea>
        </>
    );
}

const ConfirmView = ({
    cancel,
    candidate,
    setPeer,
}: {
    cancel: () => void;
    candidate: PeerCandidate;
    setPeer: (peer: PeerInfo) => void;
}) => {

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasConfirmed = useMemo(() => {
        return isLoading || error !== null;
    }, [isLoading, error]);

    const pairDevice = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const serviceController = window.modules.getLocalServiceController();
        try {
            const peer = await serviceController.app.initiatePairing(candidate.fingerprint);
            setPeer(peer);
        } catch (e) {
            console.error(e);
            setError('Failed to pair with device. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [candidate.fingerprint, setPeer]);

    return (
        <>
            <DialogHeaderView
                title={hasConfirmed ? (candidate.deviceName || 'Anonymous device') : 'Pair device?'}
                description={!hasConfirmed ? 'Make sure you trust this device before pairing.' : 'Link device'}
                iconUrl={hasConfirmed ? getUrlFromIconKey(candidate.iconKey) : undefined}
                iconView={!hasConfirmed ? <DevicesIcon /> : null}
            />
            <Separator />
            <div className="min-h-[30rem] flex flex-col items-center justify-center p-5">
                {
                    !hasConfirmed ? (<>
                        <DeviceIcon iconKey={candidate.iconKey} />
                        <div className="text-sm font-medium mt-2">
                            {candidate.deviceName || 'Anonymous device'}
                        </div>
                        <div className="text-xs text-foreground/70">
                            {candidate.fingerprint}
                        </div>
                    </>)
                        : isLoading ? (
                            <div className="text-sm text-foreground/70">Pairing device...</div>
                        ) : (
                            <div className="text-sm text-foreground/70">{error}</div>
                        )}
            </div>
            <DialogFooter className="flex flex-col items-center">
                <Button variant="secondary" onClick={cancel} className="w-full">
                    Cancel
                </Button>
                <Button
                    variant="default"
                    className="w-full"
                    onClick={pairDevice}
                    disabled={isLoading}
                >
                    Pair device
                </Button>
            </DialogFooter>
        </>
    );
}

export default function AddPeerModal({
    children,
    isOpen,
    onOpenChange,
}: {
    children: React.ReactNode;
    isOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
}) {
    const [addedPeer, setAddedPeer] = useState<PeerInfo | null>(null);
    const [selectedCandidate, setSelectedCandidate] = useState<PeerCandidate | null>(null);
    const [dialogOpen, setDialogOpen] = useState(isOpen || false);

    const onOpenChange_ = useCallback((isOpen: boolean) => {
        if (onOpenChange) {
            onOpenChange(isOpen);
        } else {
            setDialogOpen(isOpen);
        }
    }, [onOpenChange]);

    useEffect(() => {
        if (isOpen !== undefined) {
            setDialogOpen(isOpen);
        }
    }, [isOpen]);

    const reset = useCallback(() => {
        setAddedPeer(null);
        setSelectedCandidate(null);
    }, []);

    const peerAdded = useCallback((peer: PeerInfo) => {
        setAddedPeer(peer);
    }, []);

    const closeDialog = useCallback(() => {
        onOpenChange_(false);
    }, [onOpenChange_]);

    useEffect(() => {
        if (!dialogOpen) {
            reset();
        }
    }, [reset, dialogOpen]);

    return (
        <Dialog open={dialogOpen} onOpenChange={onOpenChange_} >
            {children}
            <DialogContent className="min-w-[28rem]">
                {
                    addedPeer ? (
                        <SuccessScreen peer={addedPeer} onClose={closeDialog} />
                    ) :
                        selectedCandidate ? (
                            <ConfirmView
                                cancel={reset}
                                candidate={selectedCandidate}
                                setPeer={peerAdded}
                            />
                        ) : (
                            <SelectorView setSelectedCandidate={setSelectedCandidate} />
                        )
                }
            </DialogContent>
        </Dialog>
    );
}
