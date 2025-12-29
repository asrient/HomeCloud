import { useAppState } from "@/hooks/useAppState";
import { ScrollView, Pressable, View, ViewStyle } from "react-native";
import { UIText } from "./ui/UIText";
import { useThemeColor } from "@/hooks/useThemeColor";

// Shows a row for selecting a device from the list of peers
export default function DeviceSelectorRow({ style }: { style?: ViewStyle }) {
    const { peers, selectedFingerprint, selectDevice } = useAppState();
    const bgTertiaryColor = useThemeColor({}, 'backgroundTertiary');
    const highlightColor = useThemeColor({}, 'highlight');
    const highlightTextColor = useThemeColor({}, 'highlightText');

    return (
        <View style={style}>
            <ScrollView horizontal
                style={{ padding: 12, flexDirection: 'row' }}
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
                                paddingVertical: 7,
                                paddingHorizontal: 18,
                                backgroundColor: isSelected ? highlightColor : bgTertiaryColor,
                                borderRadius: 20,
                                marginRight: 6,
                            }}
                        >
                            <UIText type='defaultSemiBold' style={isSelected ? { color: highlightTextColor } : {}}>
                                {name}
                            </UIText>
                        </Pressable>
                    )
                })}
            </ScrollView>
        </View>
    );
}
