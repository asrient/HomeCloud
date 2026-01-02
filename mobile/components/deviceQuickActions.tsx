import { PeerInfo } from "shared/types";
import { Bento } from "./bento";
import { UIText } from "./ui/UIText";
import { useCallback, useMemo, useRef } from "react";
import { useBatteryInfo, useMediaPlayback, useVolume } from "@/hooks/useSystemState";
import { useAppState } from "@/hooks/useAppState";
import { ConnectionType } from "@/lib/types";
import { View } from "react-native";
import { UIButton } from "./ui/UIButton";
import Slider from '@react-native-community/slider';


function NowPlayingBox({ fingerprint }: { fingerprint: string | null }) {
    const { mediaPlayback, isLoading, play, pause, previous, next } = useMediaPlayback(fingerprint);
    return <View style={{ alignItems: 'center', justifyContent: 'center', padding: 5, flex: 1 }}>
        <View>
            <UIText numberOfLines={1} style={{ textAlign: 'center' }} size='md'>
                {mediaPlayback?.trackName || 'Not Playing'}
            </UIText>
            {
                mediaPlayback?.artistName &&
                <UIText numberOfLines={1} style={{ textAlign: 'center' }} size='sm' font="light" color="textSecondary">
                    {mediaPlayback.artistName}
                </UIText>
            }
            {
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, gap: 0 }}>
                    <UIButton disabled={isLoading || !mediaPlayback} onPress={previous} icon="backward.fill" type="link" themeColor="icon" />
                    {mediaPlayback?.isPlaying ? (
                        <UIButton disabled={isLoading || !mediaPlayback} onPress={pause} icon="pause.fill" type="link" themeColor="icon" />
                    ) : (
                        <UIButton disabled={isLoading || !mediaPlayback} onPress={play} icon="play.fill" type="link" themeColor="icon" />
                    )}
                    <UIButton disabled={isLoading || !mediaPlayback} onPress={next} icon="forward.fill" type="link" themeColor="icon" />
                </View>

            }
        </View>
    </View>;
}

function RecentsBox({ fingerprint }: { fingerprint: string | null }) {
    return <View style={{ alignItems: 'center', justifyContent: 'center', padding: 5, flex: 1 }}>
        <UIText numberOfLines={1} style={{ textAlign: 'center' }} size='md' font="semibold">
            Continue from device
        </UIText>
    </View>;
}

function VolumeCard({deviceFingerprint}: {deviceFingerprint: string | null}) {
    const { setVolume, isLoading, error, volumeLevel } = useVolume(deviceFingerprint);
    const setVolumeTimerRef = useRef<number | null>(null);

    const thottledSetVolume = useCallback((value: number) => {
        if (setVolumeTimerRef.current) {
            clearTimeout(setVolumeTimerRef.current);
        }
        setVolumeTimerRef.current = setTimeout(() => {
            // round to 2 decimal places
            value = Math.round(value * 100) / 100;
            setVolume(value);
            setVolumeTimerRef.current = null;
        }, 1000);
    }, [setVolume]);

    return <View style={{ padding: 16, flex: 1, justifyContent: 'center' }}>
        <UIText style={{ marginBottom: 10 }} size="md" font="semibold">
            Device Volume
        </UIText>
        <Slider
            style={{ width: '100%', height: 40 }}
            minimumValue={0}
            maximumValue={1}
            value={volumeLevel || 0}
            onValueChange={thottledSetVolume}
            disabled={isLoading || !!error}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 5 }}>
            <UIText size="sm">0%</UIText>
            <UIText size="sm">100%</UIText>
        </View>
    </View>;
}

export type DeviceQuickActionsProps = {
    peerInfo: PeerInfo | null;
};

export function DeviceQuickActions({ peerInfo }: DeviceQuickActionsProps) {
    const deviceFingerprint = useMemo(() => {
        return peerInfo ? peerInfo.fingerprint : null;
    }, [peerInfo]);

    const { connections } = useAppState();

    const deviceConnection = useMemo(() => {
        if (!deviceFingerprint) return null;
        return connections.find(conn => conn.fingerprint === deviceFingerprint) || null;
    }, [connections, deviceFingerprint]);

    const { batteryInfo, isLoading: isBatteryLoading } = useBatteryInfo(deviceFingerprint);

    const batteryIcon = useMemo(() => {
        if (!batteryInfo) {
            return 'battery.100percent';
        }
        if (batteryInfo.level >= 0.75) {
            return 'battery.100percent';
        } else if (batteryInfo.level >= 0.5) {
            return 'battery.75percent';
        } else if (batteryInfo.level >= 0.25) {
            return 'battery.50percent';
        } else if (batteryInfo.level > 0) {
            return 'battery.25percent';
        } else {
            return 'battery.0percent';
        }
    }, [batteryInfo]);

    const hasBatteryInfo = useMemo(() => {
        return batteryInfo && !isBatteryLoading;
    }, [batteryInfo, isBatteryLoading]);

    return <Bento config={[
        {
            flow: 'row',
            boxes: [
                {
                    type: 'half',
                    icon: !deviceFingerprint ? 'personalhotspot' : deviceConnection ? (deviceConnection.connectionType === ConnectionType.LOCAL ? "personalhotspot" : "network") : "personalhotspot.slash",
                    title: !deviceFingerprint ? 'Online' : deviceConnection ? 'Online' : 'Offline',
                    subtitle: !deviceFingerprint ? 'This device' : deviceConnection ? (deviceConnection.connectionType === ConnectionType.LOCAL ? "Local Network" : "Web Connect") : undefined,
                },
                {
                    type: 'half',
                    icon: batteryIcon,
                    title: hasBatteryInfo ? `${Math.round((batteryInfo?.level || 0) * 100)}%` : 'Battery',
                    subtitle: hasBatteryInfo ? batteryInfo?.isCharging ? 'Charging' : ( batteryInfo?.isLowPowerMode ? 'Low Power Mode' : 'Battery') : undefined,
                    onPress: () => console.log('BT tapped')
                }
            ]
        },
        {
            flow: 'row',
            boxes: [
                {
                    type: 'full',
                    content: <NowPlayingBox fingerprint={deviceFingerprint} />,
                },
                {
                    flow: 'column',
                    boxes: [
                        {
                            type: 'half',
                            icon: 'clipboard',
                            title: 'Clipboard',
                            onPress: () => console.log('Clipboard tapped'),
                            canExpand: true,
                            expandedContent: () => <UIText>Clipboard Settings</UIText>
                        },
                        {
                            type: 'half',
                            icon: 'speaker.wave.2.fill',
                            title: 'Volume',
                            canExpand: true,
                            expandedContent: () => <VolumeCard deviceFingerprint={deviceFingerprint} />,
                            expandedContentHeight: 150,
                        }
                    ]
                },
            ]
        },
        {
            flow: 'row',
            boxes: [
                { type: 'full', content: <RecentsBox fingerprint={deviceFingerprint} /> },
            ]
        },
    ]} />
}
