import { useAppState } from "@/hooks/useAppState";
import { ScrollView, Pressable, View, ViewStyle } from "react-native";
import { UIText } from "./ui/UIText";

// Shows a row for selecting a device from the list of peers
export default function DeviceSelectorRow({ style }: { style?: ViewStyle }) {
    const { peers, selectedFingerprint, selectDevice } = useAppState();

    return (
        <View style={style}>
            <ScrollView horizontal
                style={{ padding: 5, flexDirection: 'row' }}
                showsHorizontalScrollIndicator={false}
            >
                {[null, ...peers].map((peer) => {
                    const fingerprint = peer ? peer.fingerprint : null;
                    const isSelected = fingerprint === selectedFingerprint;
                    const name = peer ? peer.deviceName : 'This Device';

                    return (
                        <Pressable
                            key={fingerprint || 'this-device'}
                            onPress={() => selectDevice(fingerprint)}
                            style={{
                                padding: 10,
                                paddingHorizontal: 15,
                                backgroundColor: isSelected ? '#007AFF' : '#dbdbdb',
                                borderRadius: 20,
                                marginRight: 5,
                            }}
                        >
                            <UIText
                                style={{ color: isSelected ? 'white' : 'black' }}
                            >
                                {name}
                            </UIText>
                        </Pressable>
                    )
                })}
            </ScrollView>
        </View>
    );
}
