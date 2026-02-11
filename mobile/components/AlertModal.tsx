import { Modal, View, StyleSheet, Platform } from 'react-native';
import { UIView } from './ui/UIView';
import { UIText } from './ui/UIText';
import { UIButton } from './ui/UIButton';
import { useAlert, AlertButtonConfig } from '@/hooks/useAlert';
import { useThemeColor } from '@/hooks/useThemeColor';

export function AlertModal() {
    const {
        isVisible,
        title,
        message,
        buttons,
        handleButtonPress,
        handleDismiss,
    } = useAlert();

    const highlightColor = useThemeColor({}, 'highlight');
    const textSecondaryColor = useThemeColor({}, 'textSecondary');

    const getButtonColor = (button: AlertButtonConfig): string | undefined => {
        if (button.style === 'destructive') {
            return '#FF3B30'; // Red color for destructive actions
        }
        if (button.style === 'cancel') {
            return textSecondaryColor;
        }
        return highlightColor;
    };

    // Only render on Android - iOS uses native Alert
    if (Platform.OS === 'ios') {
        return null;
    }

    return (
        <Modal
            visible={isVisible}
            transparent={true}
            animationType="fade"
            statusBarTranslucent={true}
            onRequestClose={handleDismiss}
        >
            <View style={styles.backdrop}>
                <UIView themeColor='backgroundSecondary' style={styles.container}>
                    <View style={styles.textContainer}>
                    <UIText size='xl' style={styles.title}>{title}</UIText>
                    {message && (
                        <UIText size='md' font='light' color='textSecondary'>{message}</UIText>
                    )}
                    </View>
                    <View style={styles.buttonContainer}>
                        {buttons.map((button, index) => (
                            <UIButton
                                key={index}
                                onPress={() => handleButtonPress(button)}
                                type="link"
                                title={button.text}
                                color={getButtonColor(button)}
                                style={index > 0 ? styles.buttonWithMargin : styles.button}
                            />
                        ))}
                    </View>
                </UIView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        width: '85%',
        maxWidth: 400,
        padding: 20,
        borderRadius: 28,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    textContainer: {
        padding: 8,
        paddingBottom: 4,
        textAlign: 'left',
    },
    title: {
        marginBottom: 8,
        textAlign: 'left',
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 8,
    },
    button: {
        paddingHorizontal: 12,
    },
    buttonWithMargin: {
        paddingHorizontal: 12,
        marginLeft: 8,
    },
});
