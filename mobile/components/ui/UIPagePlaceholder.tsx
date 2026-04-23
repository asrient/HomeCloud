import { View, StyleSheet } from 'react-native';
import { UIText } from './UIText';

export function UIPagePlaceholder({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
    return (
        <View style={styles.container}>
            <UIText size="md">{title}</UIText>
            <UIText size="sm" color="textSecondary" style={styles.detail}>{detail}</UIText>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 32,
    },
    detail: {
        textAlign: 'center',
        maxWidth: 280,
    },
});
