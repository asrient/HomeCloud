import { useCallback, useRef, useState } from "react";
import { useResource, useResourceWithPolling } from "./useResource";
import { AudioPlaybackInfo, BatteryInfo, ClipboardContent, Disk } from "shared/types";
import ServiceController from "shared/controller";
import { getServiceController } from "shared/utils";
import { SignalNodeRef } from "shared/signals";

export const useBatteryInfo = (deviceFingerprint: string | null) => {
    const [batteryInfo, setBatteryInfo] = useState<BatteryInfo | null>(null);
    const signalRef = useRef<SignalNodeRef<[BatteryInfo], string>>(null);
    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        if (!await serviceController.system.canGetBatteryInfo()) {
            if (shouldAbort()) {
                return;
            }
            setBatteryInfo(null);
            return;
        }
        // Load battery info
        const batteryInfo = await serviceController.system.getBatteryInfo();
        if (shouldAbort()) {
            return;
        }
        setBatteryInfo(batteryInfo);
    }, []);

    const clearSignals = useCallback((serviceController: ServiceController) => {
        if (signalRef.current) {
            serviceController.system.batteryInfoSignal.detach(signalRef.current);
            signalRef.current = null;
        }
    }, []);

    const setupSignals = useCallback((serviceController: ServiceController) => {
        clearSignals(serviceController);
        signalRef.current = serviceController.system.batteryInfoSignal.add((info) => {
            setBatteryInfo(info);
        });
    }, [clearSignals]);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
    });

    return { isLoading, error, reload, batteryInfo };
};

export const useVolume = (deviceFingerprint: string | null) => {
    const [volumeLevel, setVolumeLevel] = useState<number | null>(null);
    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        // Load volume level
        if (!await serviceController.system.canControlVolumeLevel()) {
            if (shouldAbort()) {
                return;
            }
            setVolumeLevel(null);
            return;
        }
        const vol = await serviceController.system.getVolumeLevel();
        if (shouldAbort()) {
            return;
        }
        setVolumeLevel(vol);
    }, []);
    const { isLoading, error, reload } = useResourceWithPolling({
        deviceFingerprint,
        load,
        interval: 10 * 1000, // Poll every 10 seconds
    });

    const setVolume = useCallback(async (level: number) => {
        const fingerprint = deviceFingerprint;
        const serviceController = await getServiceController(deviceFingerprint);
        if (fingerprint !== deviceFingerprint) {
            return;
        }
        await serviceController.system.setVolumeLevel(level);
        if (fingerprint !== deviceFingerprint) {
            return;
        }
        setVolumeLevel(level);
    }, [deviceFingerprint]);

    return { isLoading, error, reload, volumeLevel, setVolume };
};

export const useMediaPlayback = (deviceFingerprint: string | null) => {
    const [mediaPlayback, setMediaPlayback] = useState<AudioPlaybackInfo | null>(null);
    const [canControl, setCanControl] = useState<boolean>(false);
    const signalRef = useRef<SignalNodeRef<[AudioPlaybackInfo], string>>(null);
    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        // Load playback control capability
        const canControl = await serviceController.system.canControlAudioPlayback();
        if (shouldAbort()) {
            return;
        }
        setCanControl(canControl);
        if (!canControl) {
            setMediaPlayback(null);
            return;
        }
        const playbackInfo = await serviceController.system.getAudioPlaybackInfo();
        if (shouldAbort()) {
            return;
        }
        setMediaPlayback(playbackInfo);
    }, []);

    const clearSignals = useCallback((serviceController: ServiceController) => {
        if (signalRef.current) {
            serviceController.system.audioPlaybackSignal.detach(signalRef.current);
            signalRef.current = null;
        }
    }, []);

    const setupSignals = useCallback((serviceController: ServiceController) => {
        clearSignals(serviceController);
        if (!canControl) {
            console.log("Cannot control audio playback; skipping signal setup.");
            return;
        }
        signalRef.current = serviceController.system.audioPlaybackSignal.add((info) => {
            setMediaPlayback(info);
        });
    }, [clearSignals, canControl]);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
        setupSignals,
        clearSignals,
    });

    const action = useCallback(async (type: 'play' | 'pause' | 'next' | 'previous') => {
        const fingerprint = deviceFingerprint;
        const serviceController = await getServiceController(deviceFingerprint);
        if (fingerprint !== deviceFingerprint) {
            return;
        }
        if (type === 'play') {
            await serviceController.system.playAudioPlayback();
        } else if (type === 'pause') {
            await serviceController.system.pauseAudioPlayback();
        } else if (type === 'next') {
            await serviceController.system.nextAudioTrack();
        } else if (type === 'previous') {
            await serviceController.system.previousAudioTrack();
        }
        if (fingerprint !== deviceFingerprint) {
            return;
        }
        // Update playback info
        const playbackInfo = await serviceController.system.getAudioPlaybackInfo();
        if (fingerprint !== deviceFingerprint) {
            return;
        }
        setMediaPlayback(playbackInfo);
    }, [deviceFingerprint]);

    const play = useCallback(async () => {
        await action('play');
    }, [action]);

    const pause = useCallback(async () => {
        await action('pause');
    }, [action]);

    const next = useCallback(async () => {
        await action('next');
    }, [action]);

    const previous = useCallback(async () => {
        await action('previous');
    }, [action]);

    return { isLoading, error, reload, mediaPlayback, play, pause, next, previous };
};


export const useDisks = (deviceFingerprint: string | null) => {
    const [disks, setDisks] = useState<Disk[]>([]);
    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        const disks = await serviceController.system.listDisks();
        if (shouldAbort()) {
            return;
        }
        setDisks(disks);
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
    });

    return { isLoading, error, reload, disks };
};

export const useClipboard = (deviceFingerprint: string | null) => {
    const [content, setContent] = useState<ClipboardContent | null>(null);
    const load = useCallback(async (serviceController: ServiceController, shouldAbort: () => boolean) => {
        const content = await serviceController.system.readClipboard();
        if (shouldAbort()) {
            return;
        }
        setContent(content);
    }, []);

    const { isLoading, error, reload } = useResource({
        deviceFingerprint,
        load,
    });

    return { isLoading, error, reload, content };
};
