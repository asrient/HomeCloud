import { useAppState } from "@/hooks/useAppState";
import { ScrollView, View, ViewStyle } from "react-native";
import { UIButton } from "./ui/UIButton";

// Shows a row for selecting a device from the list of peers
export default function DeviceSelectorRow({ style }: { style?: ViewStyle }) {
    const { peers, selectedFingerprint, selectDevice } = useAppState();

    return (
        <View style={style}>
            <ScrollView horizontal
                style={{ padding: 10, flexDirection: 'row' }}
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
                        title={name}
                        style={{paddingVertical: 8}}
                    />)
                })}
            </ScrollView>
        </View>
    );
}
