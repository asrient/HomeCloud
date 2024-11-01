import { Storage, AgentCandidate, AgentInfo, Profile, PairingAuthType } from "@/lib/types";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "./hooks/useAppState";
import { Separator } from "@/components/ui/separator";
import { deviceIdFromFingerprint, getUrlFromIconKey } from "@/lib/storageConfig";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { ActionTypes } from "@/lib/state";
import Image from "next/image";
import SuccessScreen from "./storageAddSuccess";
import { Input } from "./ui/input";
import { getAgentInfo, scan } from "@/lib/api/discovery";
import LoadingIcon from "./ui/loadingIcon";
import { pairStorage, sendOTP } from "@/lib/api/storage";
import ProfilePicture from "./profilePicture";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from "@/components/ui/input-otp"

const DESC_LIST = [
    'Make sure device is on the same network.',
    'Open Homecloud app on the device.',
]

function SearchAgentScreen({
    setSelectedCandidate,
    isOpen,
}: {
    setSelectedCandidate: (candidate: AgentCandidate | null) => void;
    isOpen: boolean;
}) {

    const [searchText, setSearchText] = useState<string>('');
    const { serverConfig, iconKey } = useAppState();

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchText(e.target.value.trim());
    }, []);

    const showNextButton = useMemo(() => {
        return searchText.length > 0;
    }, [searchText]);

    const [descInd, setDescInd] = useState<number>(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setDescInd((ind) => (ind + 1) % DESC_LIST.length);
        }, 6000);
        return () => clearInterval(interval);
    }, []);

    const desc = useMemo(() => {
        return DESC_LIST[descInd];
    }, [descInd]);

    const [candidates, setCandidates] = useState<AgentCandidate[] | null>(null);
    const fetchTimerRef = React.useRef<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const loadingRef = React.useRef<boolean>(false);
    const firstScanRef = React.useRef<boolean>(true);

    const fetchCandidates = useCallback(async () => {
        if (loadingRef.current) {
            return;
        }
        try {
            loadingRef.current = true;
            setError(null);
            const force = firstScanRef.current;
            firstScanRef.current = false;
            const candidates_ = await scan(force);
            setCandidates(candidates_);
        } finally {
            loadingRef.current = false;
        }
    }, []);

    const pollScan = useCallback(async () => {
        if (fetchTimerRef.current) {
            clearTimeout(fetchTimerRef.current);
        }
        let delay = 4000;
        try {
            await fetchCandidates();
        } catch (e: any) {
            setError(e.message);
            delay = 8000;
        }
        if (fetchTimerRef.current) {
            clearTimeout(fetchTimerRef.current);
        }
        if (isOpen) {
            fetchTimerRef.current = window.setTimeout(pollScan, delay);
        }
    }, [fetchCandidates, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            fetchTimerRef.current && clearTimeout(fetchTimerRef.current);
            return;
        }
        pollScan();
        return () => {
            if (fetchTimerRef.current) {
                clearTimeout(fetchTimerRef.current);
            }
        };
    }, [fetchCandidates, isOpen, pollScan]);

    return (
        <>
            <DialogHeader className="md:flex-row">
                <div className="flex items-center p-1 md:pr-4">
                    <div className="h-[3rem] w-[3rem] rounded-md bg-blue-600 text-white flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
                        </svg>

                    </div>
                </div>
                <div className="grow flex-col flex justify-center">
                    <DialogTitle className="mb-1">
                        Connect Device
                    </DialogTitle>
                    <DialogDescription className="leading-4 min-h-[2rem]">
                        {
                            error ? (<span className="text-red-500">
                                {error}
                            </span>)
                                : desc
                        }
                    </DialogDescription>
                </div>
            </DialogHeader>
            <Separator />
            <div className="flex w-full items-center space-x-2 mb-2">
                <Input
                    value={searchText}
                    onChange={handleSearchChange}
                    placeholder="Search host name or IP address"
                />
                {
                    showNextButton && (
                        <div className="flex justify-end">
                            <Button
                                variant='default'
                                onClick={() => {
                                    setSelectedCandidate({
                                        host: searchText,
                                    });
                                }}
                            >
                                Next
                            </Button>
                        </div>
                    )
                }
            </div>
            <ScrollArea className="md:max-h-[50vh] min-h-[8rem]">
                <div className=" flex items-center justify-center h-full flex-wrap">
                    {
                        candidates === null ?
                            'Looking for devices..'
                            :
                            candidates.length === 0 ?
                                'No devices found.'
                                :
                                candidates.map((candidate) => (
                                    <Button title={candidate.host} key={`${candidate.fingerprint}-${candidate.host}`}
                                        variant='ghost' className="h-max flex flex-col items-center justify-center rounded-none p-2 w-[8rem]"
                                        onClick={() => setSelectedCandidate(candidate)}>
                                        <Image src={getUrlFromIconKey(candidate.iconKey)} width={60} height={60} alt="This device" className="mb-1" />
                                        <div className="max-w-[6rem] text-sm text-foreground/70 text-ellipsis truncate">{candidate.deviceName || 'Anonymous device'}</div>
                                        <div className="max-w-[6rem] text-xs text-foreground/40 text-ellipsis truncate">
                                            {candidate.fingerprint ? deviceIdFromFingerprint(candidate.fingerprint) : candidate.host}
                                        </div>
                                    </Button>
                                ))
                    }
                </div>
            </ScrollArea>
            <Separator />
            <DialogFooter>
                <div className="flex justify-center items-center w-full flex-col text-sm text-foreground/60 mt-2">
                    <div className="text-xs text-foreground/40">
                        You are discoverable as:
                    </div>
                    <div className="flex justify-center items-center">
                        <Image src={getUrlFromIconKey(iconKey)} width={28} height={28} alt="This device" className="mr-2" />
                        {serverConfig?.deviceName}
                    </div>

                </div>
            </DialogFooter>
        </>
    )
}

const labelClass = "text-md text-slate-800 font-normal";

function ProfileSelector({
    profiles,
    onSelect,
}: {
    profiles: Profile[];
    onSelect: (profile: Profile) => void;
}) {
    return (
        <div className="min-h-[10rem]">
            <div className={labelClass}>Select a profile to continue</div>
            <div className="grid grid-cols-1 gap-1 mt-2">
                {
                    profiles.map((profile, ind) => (
                        <Button key={profile.id} variant={ind % 2 === 0 ? 'secondary' : 'ghost'}
                            className="w-full rounded-none justify-start min-h-[3rem]" onClick={() => onSelect(profile)}>
                            <ProfilePicture profile={profile} size="sm" />
                            <div className="ml-2 text-base font-normal">{profile.name}</div>
                        </Button>
                    ))
                }
            </div>
        </div>
    )
}

function AgentFormScreen({
    candidate, onDone, onBack,
}: {
    candidate: AgentCandidate;
    onDone: (storage: Storage) => void;
    onBack: () => void;
}) {

    const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [targetProfile, setTargetProfile] = useState<Profile | null>(null);
    const [key, setKey] = useState<string>('');
    const [token, setToken] = useState<string | null>(null);

    const fetchAgentInfo = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const agentInfo = await getAgentInfo(candidate);
            setAgentInfo(agentInfo);
            if (agentInfo.availableProfiles.length === 1) {
                setTargetProfile(agentInfo.availableProfiles[0]);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [candidate]);

    useEffect(() => {
        fetchAgentInfo();
    }, [fetchAgentInfo]);

    const title = useMemo(() => {
        if (error) return 'Error';
        if (agentInfo) return agentInfo.deviceName;
        return candidate.deviceName || candidate.host;
    }, [agentInfo, candidate.deviceName, candidate.host, error]);

    const iconUrl = useMemo(() => {
        if (agentInfo) return getUrlFromIconKey(agentInfo.iconKey);
        return candidate.iconKey ? `/icons/${candidate.iconKey}.png` : null;
    }, [agentInfo, candidate.iconKey]);

    const description = useMemo(() => {
        if (error) return `Target: ${candidate.deviceName || candidate.host}`;
        if (agentInfo) return deviceIdFromFingerprint(agentInfo.fingerprint);
        return candidate.fingerprint ? deviceIdFromFingerprint(candidate.fingerprint) : 'Connecting..';
    }, [agentInfo, candidate.deviceName, candidate.fingerprint, candidate.host, error]);

    const resetForm = useCallback(() => {
        setKey('');
        setToken(null);
        setTargetProfile(null);
        fetchAgentInfo();
    }, [fetchAgentInfo]);

    const submitPassword = useCallback(async () => {
        if (!targetProfile || !agentInfo || !key) {
            console.error('Cannot proceed without target profile and password');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { storage } = await pairStorage({
                host: candidate.host,
                fingerprint: agentInfo.fingerprint,
                targetProfileId: targetProfile.id,
                password: key,
            });
            if (!storage) {
                setError('Could not pair device');
                return;
            }
            onDone(storage);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [agentInfo, candidate.host, key, onDone, targetProfile]);

    const requestOTP = useCallback(async () => {
        if (!targetProfile || !agentInfo) {
            console.error('Cannot proceed without target profile');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { token, storage } = await pairStorage({
                host: candidate.host,
                fingerprint: agentInfo.fingerprint,
                targetProfileId: targetProfile.id,
            });
            if (storage) {
                onDone(storage);
                return;
            }
            if (!token) {
                setError('Could not request OTP, token not received');
                return;
            }
            setToken(token);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [agentInfo, candidate.host, onDone, targetProfile]);

    const submitOTP = useCallback(async () => {
        if (!targetProfile || !agentInfo || !token || !key) {
            console.error('Cannot proceed without target profile and OTP');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { storage } = await sendOTP({
                token,
                otp: key,
                host: candidate.host,
                fingerprint: agentInfo.fingerprint,
            });
            if (!storage) {
                setError('Could not pair device');
                return;
            }
            onDone(storage);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [agentInfo, candidate.host, key, onDone, targetProfile, token]);

    const containerClass = "flex flex-col items-center justify-center space-y-2 min-h-[5rem]";

    return (
        <>
            <DialogHeader className="md:flex-row">
                <div className="flex items-center p-1 md:pr-4">
                    {
                        error ? (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                        )
                            :
                            iconUrl ?
                                <Image src={iconUrl} width={55} height={55} alt='device' />
                                :
                                (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                                )
                    }
                </div>
                <div className="grow flex-col flex justify-center">
                    <DialogTitle className="mb-1">
                        {title}
                    </DialogTitle>
                    <DialogDescription className="leading-4">
                        {description}
                    </DialogDescription>
                </div>
            </DialogHeader>
            <Separator />
            {
                error ? (
                    <div className="p-2 text-red-500 text-sm">
                        {error}
                    </div>
                )
                    :
                    loading ? (
                        <div className="flex justify-center items-center p-2">
                            <LoadingIcon className="mr-1" />
                            Loading...
                        </div>
                    )
                        :
                        agentInfo && (
                            !targetProfile ? (
                                <ScrollArea>
                                    <ProfileSelector profiles={agentInfo.availableProfiles} onSelect={setTargetProfile} />
                                </ScrollArea>
                            )
                                :
                                agentInfo.pairingAuthType === PairingAuthType.Password ? (
                                    <div className={containerClass}>
                                        <div className={labelClass}>Enter password for "{targetProfile.name}"</div>
                                        <Input value={key} onChange={(e) => setKey(e.target.value)} type="password" />
                                    </div>
                                )
                                    :
                                    agentInfo.pairingAuthType === PairingAuthType.OTP ? (
                                        token ? (
                                            <div className={containerClass}>
                                                <div className={labelClass}>Enter OTP for "{targetProfile.name}"</div>
                                                <InputOTP maxLength={6}
                                                    value={key}
                                                    onChange={(e) => setKey(e)}
                                                >
                                                    <InputOTPGroup>
                                                        <InputOTPSlot index={0} />
                                                        <InputOTPSlot index={1} />
                                                        <InputOTPSlot index={2} />
                                                        <InputOTPSlot index={3} />
                                                        <InputOTPSlot index={4} />
                                                        <InputOTPSlot index={5} />
                                                    </InputOTPGroup>
                                                </InputOTP>
                                            </div>
                                        ) : (
                                            <div className={containerClass}>
                                                <div className={labelClass}>
                                                    Request OTP for pairing?
                                                </div>
                                            </div>
                                        )
                                    )
                                        :
                                        <div className={containerClass}>
                                            <div className="p-2 text-red-500">
                                                Pairing method not supported.
                                            </div>
                                        </div>
                        )
            }

            <DialogFooter>
                <div className="space-x-2 flex justify-center items-center w-full">
                    <Button variant='secondary' size='lg' onClick={() => {
                        if (agentInfo && agentInfo.availableProfiles.length > 1 && !!targetProfile) {
                            setTargetProfile(null);
                            return;
                        }
                        onBack();
                    }}>Back</Button>
                    <Button disabled={
                        loading || (!!agentInfo && !targetProfile) || (agentInfo?.pairingAuthType === PairingAuthType.Password && !!targetProfile && !key)
                        || (agentInfo?.pairingAuthType === PairingAuthType.OTP && !!targetProfile && !!token && !key)
                    } variant='default' size='lg' onClick={() => {
                        if (error) {
                            if (token) {
                                setError(null);
                                setKey('');
                            } else {
                                resetForm();
                            }
                            return;
                        }
                        if (agentInfo) {
                            if (agentInfo.pairingAuthType === PairingAuthType.Password) {
                                submitPassword();
                            } else if (agentInfo.pairingAuthType === PairingAuthType.OTP) {
                                if (token && key) {
                                    submitOTP();
                                } else if (!token) {
                                    requestOTP();
                                }
                            }
                        }
                    }}>
                        {
                            error ? 'Retry' : 'Next'
                        }
                    </Button>
                </div>

            </DialogFooter>
        </>
    )
}

function candidateFromStorage(storage: Storage): AgentCandidate {
    const agent = storage.agent!;
    return {
        host: agent.authority,
        fingerprint: agent.fingerprint,
        deviceName: agent.deviceName,
        //iconKey: agent.iconKey,
    };
}

export default function AddAgentModal({
    children,
    existingStorage,
    isOpen,
    setOpenChange,
}: {
    children?: React.ReactNode;
    existingStorage?: Storage;
    isOpen?: boolean;
    setOpenChange?: (isOpen: boolean) => void;
}) {
    const [addedStorage, setAddedStorage] = useState<Storage | null>(null);
    const [dialogOpen, setDialogOpen] = useState(isOpen || false);
    const [screen, setScreen] = useState<'select' | 'form' | 'success'>('select');
    const dispatch = useAppDispatch();
    const [candidate, setCandidate] = useState<AgentCandidate | null>(null);

    useEffect(() => {
        if (addedStorage) {
            setScreen('success');
        }
        else if (candidate) {
            setScreen('form');
        } else {
            setScreen('select');
        }
    }, [addedStorage, candidate]);

    useEffect(() => {
        if (existingStorage) {
            setCandidate(candidateFromStorage(existingStorage));
        }
    }, [existingStorage]);

    const onOpenChange_ = useCallback((isOpen: boolean) => {
        if (setOpenChange) {
            setOpenChange(isOpen);
        } else {
            setDialogOpen(isOpen);
        }
    }, [setOpenChange]);

    useEffect(() => {
        if (isOpen !== undefined) {
            setDialogOpen(isOpen);
        }
    }, [isOpen]);

    const backToBegining = useCallback(() => {
        setAddedStorage(null);
        if (existingStorage) {
            setCandidate(candidateFromStorage(existingStorage));
        } else {
            setCandidate(null);
        }
    }, [existingStorage]);

    const storageAdded = useCallback((storage: Storage) => {
        if (existingStorage) {
            console.log('update storage', storage);
            dispatch(ActionTypes.UPDATE_STORAGE, { storage, storageId: existingStorage.id });
        } else {
            dispatch(ActionTypes.ADD_STORAGE, { storage });
        }
        setAddedStorage(storage);
    }, [dispatch, existingStorage]);

    const closeDialog = useCallback(() => {
        onOpenChange_(false);
    }, [onOpenChange_]);

    useEffect(() => {
        if (!dialogOpen) {
            backToBegining();
        }
    }, [backToBegining, dialogOpen]);

    return (
        <Dialog open={dialogOpen} onOpenChange={onOpenChange_} >
            {children}
            <DialogContent className="sm:max-w-[28rem]">
                {
                    screen === 'select' ?
                        <SearchAgentScreen setSelectedCandidate={setCandidate} isOpen={dialogOpen} />
                        : screen === 'form' ?
                            candidate && <AgentFormScreen candidate={candidate} onDone={storageAdded} onBack={existingStorage ? closeDialog : backToBegining} />
                            : screen === 'success' ?
                                addedStorage && <SuccessScreen storage={addedStorage} onClose={closeDialog} />
                                : null
                }
            </DialogContent>
        </Dialog>
    );
}
