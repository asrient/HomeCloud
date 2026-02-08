import { useAppState } from "@/hooks/useAppState";
import { useAccountState } from "@/hooks/useAccountState";
import { ScrollView, View, ViewStyle, StyleSheet, StyleProp } from "react-native";
import { UIButton } from "./ui/UIButton";
import { getDeviceIconName } from "./ui/getPeerIconName";
import { useState } from "react";
import DeviceSelectorSheet from "./DeviceSelectorSheet";
import { useRouter } from "expo-router";
import { useDiscoverable } from "@/hooks/useDiscoverable";
import InstallLinkModal from "./InstallLinkModal";

// Shows a row for selecting a device from the list of peers
export default function DeviceSelectorRow({ style }: { style?: ViewStyle }) {
    const { peers, selectedFingerprint, selectDevice, deviceInfo, connections } = useAppState();
    const { isLinked } = useAccountState();
    const isDiscoverable = useDiscoverable();
    const router = useRouter();
    const [sheetOpen, setSheetOpen] = useState(false);
    const [installLinkOpen, setInstallLinkOpen] = useState(false);
    const hasActiveConnections = connections.length > 0;
    const showAddDevice = !isLinked || peers.length === 0;

    const scrollViewStyle: StyleProp<ViewStyle> = StyleSheet.compose({
        flexDirection: 'row',
        padding: 10,
        overflow: 'visible',
    }, style || {});

    return (
        <View>
            <ScrollView horizontal
                style={scrollViewStyle}
                showsHorizontalScrollIndicator={false}
            >
                <UIButton
                    key="device-list"
                    onPress={() => setSheetOpen(true)}
                    type={(hasActiveConnections || !isDiscoverable) ? 'primary' : 'secondary'}
                    color={!isDiscoverable ? 'orange' : undefined}
                    size="md"
                    icon={isDiscoverable ? "antenna.radiowaves.left.and.right" : "personalhotspot.slash"}
                    style={{ paddingVertical: 8 }}
                />
                {[null, ...peers].map((peer) => {
                    const fingerprint = peer ? peer.fingerprint : null;
                    const isSelected = fingerprint === selectedFingerprint;
                    const name = peer ? peer.deviceName : 'This Device';
                    return (<UIButton
                        key={fingerprint || 'this-device'}
                        onPress={() => selectDevice(fingerprint)}
                        type={isSelected ? 'primary' : 'secondary'}
                        size='md'
                        icon={peer ? getDeviceIconName(peer.deviceInfo) : getDeviceIconName(deviceInfo!)}
                        title={name}
                        style={{ paddingVertical: 8 }}
                    />)
                })}
                {showAddDevice && (
                    <UIButton
                        key="add-device"
                        onPress={() => isLinked ? setInstallLinkOpen(true) : router.navigate('/login')}
                        type="secondary"
                        size="md"
                        icon="plus.circle"
                        title="Add device"
                        style={{ paddingVertical: 8 }}
                    />
                )}
            </ScrollView>
            <DeviceSelectorSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} />
            <InstallLinkModal isOpen={installLinkOpen} onClose={() => setInstallLinkOpen(false)} />
        </View>
    );
}
