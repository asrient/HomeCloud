import { useAppState } from "@/hooks/useAppState";
import { ScrollView, View, ViewStyle, StyleSheet, StyleProp } from "react-native";
import { UIButton } from "./ui/UIButton";
import { getDeviceIconName } from "./ui/getPeerIconName";

// Shows a row for selecting a device from the list of peers
export default function DeviceSelectorRow({ style }: { style?: ViewStyle }) {
    const { peers, selectedFingerprint, selectDevice, deviceInfo } = useAppState();

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
            </ScrollView>
        </View>
    );
}
