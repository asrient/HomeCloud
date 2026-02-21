import { View, ActivityIndicator, StyleSheet, useWindowDimensions } from "react-native";
import { UIText } from "./ui/UIText";
import { UIView } from "./ui/UIView";
import { UIButton } from "./ui/UIButton";
import { useLoadingStore } from "@/hooks/useLoading";


export function LoadingModal() {
    const { entries, removeEntry } = useLoadingStore();
    const { width, height } = useWindowDimensions();

    const current = entries.length > 0 ? entries[entries.length - 1] : null;

    if (!current) {
        return null;
    }

    const handleCancel = () => {
        if (current.onCancel) {
            current.onCancel();
        }
        removeEntry(current.id);
    };

    return (
        <View style={[styles.overlay, { width, height }]} pointerEvents="auto">
            <UIView
                themeColor="backgroundSecondary"
                style={styles.container}
                useGlass
            >
                <View style={styles.content}>
                    <ActivityIndicator size="large" />
                    <View style={{ height: 5 }} />
                    <UIText size="sm" numberOfLines={2} font="semibold" style={{ textAlign: 'center' }}>
                        {current.title || "Loading"}
                    </UIText>
                </View>
                {current.canCancel &&
                    <UIButton
                        type="link"
                        title="Cancel"
                        onPress={handleCancel}
                        style={styles.cancelButton}
                    />}
            </UIView>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
    },
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 300,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 10,
    },
    content: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        paddingTop: 0,
    },
});
