import { View, StyleSheet, Switch } from 'react-native';
import { UIPageSheet } from './ui/UIPageSheet';
import { Section, Line, FormContainer } from './ui/UIFormPrimatives';
import { UIText } from './ui/UIText';
import { UIIcon } from './ui/UIIcon';
import { useAppState } from '@/hooks/useAppState';
import DeviceIcon from './deviceIcon';
import { getDeviceIconName } from './ui/getPeerIconName';
import { UIScrollView } from './ui/UIScrollView';
import { ConnectionInfo, PeerInfo } from 'shared/types';
import { ConnectionType } from '@/lib/types';
import { useEffect, useState } from 'react';
import { useKeepAwakeStore } from '@/hooks/useKeepAwake';
import { useThemeColor } from '@/hooks/useThemeColor';

function DeviceSubtext({ peer, connection }: { peer: PeerInfo; connection: ConnectionInfo | null }) {
    const osText = peer.deviceInfo ? `${peer.deviceInfo.os} ${peer.deviceInfo.osFlavour}` : peer.version;
    if (connection) {
        const connLabel = connection.connectionType === ConnectionType.LOCAL ? 'Local Network' : 'Web Connect';
        const connIcon = connection.connectionType === ConnectionType.LOCAL ? 'personalhotspot' : 'network';
        return (
            <View style={styles.subtextRow}>
                <UIText size="xs" color="textSecondary" numberOfLines={1}>
                    {`${osText} · `}
                </UIText>
                <UIIcon name={connIcon} size={11} color="#34C759" />
                <UIText size="xs" color="textSecondary" numberOfLines={1}>
                    {` ${connLabel}`}
                </UIText>
            </View>
        );
    }
    return (
        <UIText size="xs" color="textSecondary" numberOfLines={1}>
            {osText}
        </UIText>
    );
}

function getConnection(fingerprint: string, connections: ConnectionInfo[]): ConnectionInfo | null {
    return connections.find(conn => conn.fingerprint === fingerprint) || null;
}

type DeviceSelectorSheetProps = {
    isOpen: boolean;
    onClose: () => void;
};

export default function DeviceSelectorSheet({ isOpen, onClose }: DeviceSelectorSheetProps) {
    const { peers, connections, selectedFingerprint, selectDevice, deviceInfo } = useAppState();
    const [deviceName, setDeviceName] = useState<string>('This Device');
    const { enabled: keepAwakeEnabled, setEnabled: setKeepAwake } = useKeepAwakeStore();
    const highlightColor = useThemeColor({}, 'highlight');

    useEffect(() => {
        modules.getLocalServiceController().app.peerInfo().then(info => {
            setDeviceName(info.deviceName || modules.config.DEVICE_NAME);
        });
    }, []);

    const handleSelect = (fingerprint: string | null) => {
        selectDevice(fingerprint);
        onClose();
    };

    const isSelected = (fingerprint: string | null) => fingerprint === selectedFingerprint;

    return (
        <UIPageSheet isOpen={isOpen} onClose={onClose} title="Devices">
            <UIScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                <FormContainer>
                    <View style={styles.hero}>
                        <UIIcon name="antenna.radiowaves.left.and.right" size={36} color={highlightColor} />
                        <UIText size="md" font="semibold" style={styles.heroTitle}>
                            Discoverable
                        </UIText>
                        <UIText size="sm" color="textSecondary" style={styles.heroSubtitle}>
                            Your device is visible to others as {`"${deviceName}"`}.
                        </UIText>
                    </View>

                    <Section>
                        <Line title="Keep Awake">
                            <Switch
                                value={keepAwakeEnabled}
                                onValueChange={setKeepAwake}
                                trackColor={{ true: highlightColor }}
                            />
                        </Line>
                    </Section>

                    <Section title="This Device">
                        <Line onPress={() => handleSelect(null)}>
                            <View style={styles.deviceRow}>
                                <UIIcon
                                    name={getDeviceIconName(deviceInfo!)}
                                    size={24}
                                />
                                <View style={styles.deviceInfo}>
                                    <UIText size="md" color={isSelected(null) ? 'highlight' : 'text'}>
                                        {deviceName}
                                    </UIText>
                                    {deviceInfo && (
                                        <UIText size="xs" color="textSecondary" numberOfLines={1}>
                                            {`${deviceInfo.os} ${deviceInfo.osFlavour}`}
                                        </UIText>
                                    )}
                                </View>
                                {isSelected(null) && (
                                    <UIIcon name="checkmark" size={18} themeColor="highlight" />
                                )}
                            </View>
                        </Line>
                    </Section>

                    {peers.length > 0 && (
                        <Section title="My Devices">
                            {peers.map((peer: PeerInfo) => {
                                const connection = getConnection(peer.fingerprint, connections);
                                const selected = isSelected(peer.fingerprint);
                                return (
                                    <Line key={peer.fingerprint} onPress={() => handleSelect(peer.fingerprint)}>
                                        <View style={styles.deviceRow}>
                                            <DeviceIcon size={28} iconKey={peer.iconKey} />
                                            <View style={styles.deviceInfo}>
                                                <UIText size="md" color={selected ? 'highlight' : 'text'} numberOfLines={1}>
                                                    {peer.deviceName}
                                                </UIText>
                                                <DeviceSubtext peer={peer} connection={connection} />
                                            </View>
                                            {selected && (
                                                <UIIcon name="checkmark" size={18} themeColor="highlight" />
                                            )}
                                        </View>
                                    </Line>
                                );
                            })}
                        </Section>
                    )}
                </FormContainer>
            </UIScrollView>
        </UIPageSheet>
    );
}

const styles = StyleSheet.create({
    hero: {
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    heroTitle: {
        marginTop: 10,
    },
    heroSubtitle: {
        textAlign: 'center',
        marginTop: 4,
    },
    deviceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    deviceInfo: {
        marginLeft: 12,
        flex: 1,
    },
    subtextRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});
