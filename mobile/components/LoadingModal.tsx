import { Modal, View, ActivityIndicator } from "react-native";
import { UIText } from "./ui/UIText";
import { UIView } from "./ui/UIView";


export function LoadingModal({
    isActive, title,
}: {
    isActive: boolean;
    title?: string;
}) {
    if (!isActive) {
        return null;
    }

    return (
        <Modal
            transparent={true}
            animationType="fade"
            visible={isActive}
        >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <UIView
                    themeColor="backgroundSecondary"
                    style={{
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 200,
                        padding: 20,
                        borderRadius: 20,
                    }}
                >
                    <ActivityIndicator size="large" />
                    {title &&
                        <>
                            <View style={{ height: 5 }} />
                            <UIText size="sm" numberOfLines={2} font="semibold" style={{ textAlign: 'center' }}>
                                {title}
                            </UIText>
                        </>}
                </UIView>
            </View>
        </Modal>
    );
}
