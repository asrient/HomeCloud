import { PeerInfo } from "shared/types";
import { Bento, BentoGroup } from "./bento";
import { UIText } from "./ui/UIText";
import { useCallback, useMemo, useRef, useState } from "react";
import { useBatteryInfo, useClipboard, useMediaPlayback, useScreenLock, useVolume } from "@/hooks/useSystemState";
import { useAppState } from "@/hooks/useAppState";
import { ConnectionType } from "@/lib/types";
import { ActivityIndicator, Alert, Platform, View } from "react-native";
import { UIButton } from "./ui/UIButton";
import { UIView } from "./ui/UIView";
import { UITextInput } from "./ui/UITextInput";
import Slider from '@react-native-community/slider';
import { DisksGrid } from "./disksGrid";
import { useAppsAvailable, useTerminalAvailable } from "@/hooks/useApps";
import { useWorkflowsAvailable } from "@/hooks/useWorkflows";
import { useAgentConfig } from "@/hooks/useAgent";
import { getLocalServiceController, getServiceController, isIos } from "@/lib/utils";

import { UIIcon } from "./ui/UIIcon";
import { useSendAssets } from "@/hooks/useSendAssets";
import { useManagedLoading } from "@/hooks/useManagedLoading";
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';


function NowPlayingBox({ fingerprint }: { fingerprint: string | null }) {
    const { mediaPlayback, isLoading, play, pause, previous, next } = useMediaPlayback(fingerprint);
    return <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, padding: 10 }}>
        <View style={{ flex: 1, justifyContent: 'center', paddingLeft: 8 }}>
            <UIText numberOfLines={1} size='md'>
                {mediaPlayback?.trackName || 'Not Playing'}
            </UIText>
            {mediaPlayback?.artistName &&
                <UIText numberOfLines={1} size='sm' font="light" color="textSecondary">
                    {mediaPlayback.artistName}
                </UIText>
            }
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
            <UIButton disabled={isLoading || !mediaPlayback} onPress={previous} icon="backward.fill" type="link" themeColor="icon" />
            {mediaPlayback?.isPlaying ? (
                <UIButton disabled={isLoading || !mediaPlayback} onPress={pause} icon="pause.fill" type="link" themeColor="icon" />
            ) : (
                <UIButton disabled={isLoading || !mediaPlayback} onPress={play} icon="play.fill" type="link" themeColor="icon" />
            )}
            <UIButton disabled={isLoading || !mediaPlayback} onPress={next} icon="forward.fill" type="link" themeColor="icon" />
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
            <UIButton
                disabled={isLoading || !!error || !content}
                onPress={copyToClipboard}
                title="Copy"
                type={isIos ? "secondary" : "primary"}
                stretch
            />
        </View>
    </View>;
}

function SendTextCard({ deviceFingerprint, dismiss }: { deviceFingerprint: string | null, dismiss: () => void }) {
    const { withLoading, isActive } = useManagedLoading();
    const [text, setText] = useState('');

    const sendMessage = useCallback(async () => {
        if (text.trim().length === 0 || !deviceFingerprint) return;
        const message = text.trim();
        setText('');
        await withLoading(async () => {
            const sc = await getServiceController(deviceFingerprint);
            await sc.app.receiveContent(null, message, 'text');
        }, { title: 'Sending...', errorTitle: 'Could not send' });
        dismiss();
    }, [text, deviceFingerprint, withLoading, dismiss]);

    return <View style={{ padding: 10, flex: 1, justifyContent: 'center' }}>
        <UIText style={{ marginBottom: 10, marginLeft: 4 }} size="md" font="semibold">
            Send Text
        </UIText>
        <UIView
            themeColor={Platform.OS === 'android' ? 'backgroundTertiary' : 'backgroundSecondary'}
            style={{
                width: '100%',
                padding: 2,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                borderRadius: 50,
            }}
        >
            <UITextInput
                variant="plain"
                style={{ flex: 1, marginLeft: 12 }}
                placeholder="Send message"
                value={text}
                onChangeText={setText}
                autoFocus
            />
            <UIButton
                type="link"
                themeColor={text.trim().length === 0 ? 'textSecondary' : 'highlight'}
                icon="arrow.up.circle.fill"
                disabled={text.trim().length === 0 || isActive}
                onPress={sendMessage}
            />
        </UIView>
    </View>;
}

export type DeviceQuickActionsProps = {
    peerInfo: PeerInfo | null;
    fingerprint: string | null;
    onNavigate: (path: string) => void;
};

export function DeviceQuickActions({ peerInfo, fingerprint, onNavigate }: DeviceQuickActionsProps) {
    const deviceFingerprint = useMemo(() => {
        return peerInfo ? peerInfo.fingerprint : null;
    }, [peerInfo]);

    const routeFingerprint = fingerprint || 'local';

    const { connections } = useAppState();

    const deviceConnection = useMemo(() => {
        if (!deviceFingerprint) return null;
        return connections.find(conn => conn.fingerprint === deviceFingerprint) || null;
    }, [connections, deviceFingerprint]);

    const { batteryInfo, isLoading: isBatteryLoading } = useBatteryInfo(deviceFingerprint);
    const { available: appsAvailable } = useAppsAvailable(deviceFingerprint);
    const { available: terminalAvailable } = useTerminalAvailable(deviceFingerprint);
    const { available: workflowsAvailable } = useWorkflowsAvailable(deviceFingerprint);
    const { config: agentConfig } = useAgentConfig(deviceFingerprint);
    const { lockStatus, lockScreen } = useScreenLock(deviceFingerprint);

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

    const connectionLabel = useMemo(() => {
        if (!deviceFingerprint) return 'This device';
        if (!deviceConnection) return 'Offline';
        return deviceConnection.connectionType === ConnectionType.LOCAL ? 'Local Network' : 'Web Connect';
    }, [deviceFingerprint, deviceConnection]);

    const batteryLabel = useMemo(() => {
        if (!hasBatteryInfo) return 'Battery';
        const pct = `${Math.round((batteryInfo?.level || 0) * 100)}%`;
        if (batteryInfo?.isCharging) return `${pct} · Charging`;
        return pct;
    }, [hasBatteryInfo, batteryInfo]);

    const { sendAssets } = useSendAssets();

    const openDocPicker = useCallback(async () => {
        if (!deviceFingerprint) return;
        const result = await DocumentPicker.getDocumentAsync({
            multiple: true,
            copyToCacheDirectory: true,
        });
        if (result.canceled || result.assets.length === 0) return;
        await sendAssets(deviceFingerprint, result.assets, {
            getPath: (a: any) => a.uri,
            label: 'files',
            deleteAfter: true,
        });
    }, [deviceFingerprint, sendAssets]);

    const openImagePicker = useCallback(async () => {
        if (!deviceFingerprint) return;
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsMultipleSelection: true,
        });
        if (result.canceled || result.assets.length === 0) return;
        await sendAssets(deviceFingerprint, result.assets, {
            getPath: (a: any) => a.uri,
            label: 'photos',
        });
    }, [deviceFingerprint, sendAssets]);

    const handleLockScreen = useCallback(() => {
        Alert.alert(
            'Lock Screen',
            'Once locked you won\'t be able to unlock the screen remotely.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Lock',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await lockScreen();
                        } catch (e) {
                            console.error('Failed to lock screen:', e);
                        }
                    },
                },
            ],
        );
    }, [lockScreen]);

    return <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, maxWidth: 500, alignSelf: 'center', width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <UIIcon
                    name={!deviceFingerprint ? 'personalhotspot' : deviceConnection ? (deviceConnection.connectionType === ConnectionType.LOCAL ? 'personalhotspot' : 'network') : 'personalhotspot.slash'}
                    size={14}
                    themeColor="text"
                />
                <UIText size="sm" color="text">{connectionLabel}</UIText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <UIIcon name={batteryIcon} size={14} themeColor="text" />
                <UIText size="sm" color="text">{batteryLabel}</UIText>
                {lockStatus === 'locked' && (
                    <UIIcon name="lock.fill" size={14} themeColor="text" />
                )}
            </View>
        </View>
        <Bento config={[
            {
                flow: 'row',
                boxes: [
                    {
                        type: 'small',
                        icon: 'clipboard',
                        isCircular: true,
                        canExpand: true,
                        expandedContent: (dismiss) => <ClipboardCard deviceFingerprint={deviceFingerprint} dismiss={dismiss} />,
                        expandedContentHeight: 300,
                    },
                    {
                        type: 'small',
                        icon: 'speaker.wave.2.fill',
                        isCircular: true,
                        canExpand: true,
                        expandedContent: () => <VolumeCard deviceFingerprint={deviceFingerprint} />,
                        expandedContentHeight: 150,
                    },
                    {
                        type: 'small',
                        icon: 'arrow.up.circle.fill',
                        isCircular: true,
                        disabled: !deviceFingerprint,
                        contextMenu: deviceFingerprint ? {
                            title: 'Send to device',
                            actions: [
                                { id: 'files', title: 'Files', icon: 'folder' },
                                { id: 'photos', title: 'Photos', icon: 'photo' },
                            ],
                            onAction: (id) => {
                                if (id === 'files') openDocPicker();
                                else if (id === 'photos') openImagePicker();
                            },
                        } : undefined,
                    },
                    {
                        type: 'small',
                        icon: 'text.bubble.fill',
                        isCircular: true,
                        disabled: !deviceFingerprint,
                        canExpand: !!deviceFingerprint,
                        expandedContent: (dismiss) => <SendTextCard deviceFingerprint={deviceFingerprint} dismiss={dismiss} />,
                        expandedContentHeight: 120,
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
                        onPress: () => onNavigate(`/device/${routeFingerprint}/files`),
                    },
                    {
                        type: 'half',
                        icon: 'photo.stack',
                        title: 'Photos',
                        subtitle: 'Photo library',
                        onPress: () => onNavigate(`/device/${routeFingerprint}/photos`),
                    },
                ]
            },
            {
                flow: 'row',
                boxes: [
                    {
                        type: 'half',
                        content: <NowPlayingBox fingerprint={deviceFingerprint} />,
                    },
                ]
            },
            {
                flow: 'row',
                boxes: [
                    {
                        type: 'small',
                        icon: 'display',
                        isCircular: true,
                        disabled: !appsAvailable,
                        onPress: () => onNavigate(`/screen-control?fingerprint=${routeFingerprint}`),
                    },
                    {
                        type: 'small',
                        icon: 'terminal.fill',
                        isCircular: true,
                        disabled: !terminalAvailable,
                        onPress: () => onNavigate(`/terminal?fingerprint=${routeFingerprint}`),
                    },
                    {
                        type: 'small',
                        icon: 'bolt.fill',
                        isCircular: true,
                        disabled: !workflowsAvailable,
                        onPress: () => onNavigate(`/device/${routeFingerprint}/workflows`),
                    },
                    {
                        type: 'small',
                        icon: 'bubble.left.and.text.bubble.right.fill',
                        isCircular: true,
                        disabled: !agentConfig,
                        onPress: () => onNavigate(`/agent?fingerprint=${routeFingerprint}`),
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
            {
                flow: 'row',
                boxes: [
                    {
                        type: 'half',
                        icon: 'lock.fill',
                        title: 'Lock Screen',
                        disabled: lockStatus !== 'unlocked',
                        onPress: handleLockScreen,
                    },
                ]
            }
        ]} />
    </>
}
