import { PeerInfo } from "shared/types";
import { Bento } from "./bento";
import { UIText } from "./ui/UIText";
import { useCallback, useMemo, useRef } from "react";
import { useBatteryInfo, useClipboard, useMediaPlayback, useVolume } from "@/hooks/useSystemState";
import { useAppState } from "@/hooks/useAppState";
import { ConnectionType } from "@/lib/types";
import { ActivityIndicator, View } from "react-native";
import { UIButton } from "./ui/UIButton";
import Slider from '@react-native-community/slider';
import { DisksGrid } from "./disksGrid";
import { getLocalServiceController } from "@/lib/utils";
import { useRouter } from "expo-router";


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

function DisksBox({ fingerprint }: { fingerprint: string | null }) {
    return <View style={{ flex: 1, width: '100%', height: '100%' }}>
        <UIText style={{ paddingTop: 12, paddingLeft: 30 }} numberOfLines={1} size='md'>
            Storage
        </UIText>
        <DisksGrid deviceFingerprint={fingerprint} />
    </View>;
}

function VolumeCard({ deviceFingerprint }: { deviceFingerprint: string | null }) {
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

function ClipboardCard({ deviceFingerprint, dismiss }: { deviceFingerprint: string | null, dismiss: () => void }) {
    const { isLoading, error, content } = useClipboard(deviceFingerprint);

    const clippedText = useMemo(() => {
        if (!content || content.content.length === 0) {
            return 'No clipboard content';
        }
        return content.content;
    }, [content]);

    const copyToClipboard = useCallback(() => {
        if (!content) return;
        const localSc = getLocalServiceController();
        localSc.system.copyToClipboard(content.content, content.type);
        dismiss();
    }, [content, dismiss]);

    return <View style={{ padding: 5, flex: 1, justifyContent: 'center' }}>
        <UIText style={{ margin: 12 }} size="md" font="semibold">
            Device Clipboard
        </UIText>
        <View style={{ padding: 10, minHeight: 100, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            {isLoading ? (
                <ActivityIndicator />
            ) : error ? (
                <UIText color="textSecondary" size="sm" font='light'>Could not load clipboard.</UIText>
            ) : (
                <UIText color="textSecondary" size="sm" font='light' numberOfLines={8}>{clippedText}</UIText>
            )}
        </View>
        <View style={{ width: '100%', marginTop: 5 }}>
            <UIButton disabled={isLoading || !!error || !content} onPress={copyToClipboard} title="Copy" type="primary" stretch />
        </View>
    </View>;
}

export type DeviceQuickActionsProps = {
    peerInfo: PeerInfo | null;
    fingerprint: string | null;
};

export function DeviceQuickActions({ peerInfo, fingerprint }: DeviceQuickActionsProps) {
    const router = useRouter();
    const deviceFingerprint = useMemo(() => {
        return peerInfo ? peerInfo.fingerprint : null;
    }, [peerInfo]);

    const routeFingerprint = fingerprint || 'local';

    const { connections } = useAppState();

    const deviceConnection = useMemo(() => {
        if (!deviceFingerprint) return null;
        return connections.find(conn => conn.fingerprint === deviceFingerprint) || null;
    }, [connections, deviceFingerprint]);

    const { batteryInfo, isLoading: isBatteryLoading, reload: batteryReload } = useBatteryInfo(deviceFingerprint);

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
                    subtitle: hasBatteryInfo ? batteryInfo?.isCharging ? 'Charging' : (batteryInfo?.isLowPowerMode ? 'Low Power Mode' : 'Battery') : undefined,
                    onPress: batteryReload,
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
                            canExpand: true,
                            expandedContent: (dismiss) => <ClipboardCard deviceFingerprint={deviceFingerprint} dismiss={dismiss} />,
                            expandedContentHeight: 300,
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
                {
                    type: 'half',
                    icon: 'folder.fill',
                    title: 'Files',
                    subtitle: 'Browse files',
                    onPress: () => router.push(`/device/${routeFingerprint}/files`),
                },
                {
                    type: 'half',
                    icon: 'photo.stack',
                    title: 'Photos',
                    subtitle: 'Photo library',
                    onPress: () => router.push(`/device/${routeFingerprint}/photos`),
                },
            ]
        },
        {
            flow: 'row',
            boxes: [
                {
                    type: 'full',
                    content: <DisksBox fingerprint={deviceFingerprint} />,
                    contentHeight: 140,
                },
            ]
        },
    ]} />
}
