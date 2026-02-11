import { Modal, View, StyleSheet } from 'react-native';
import { UIView } from './ui/UIView';
import { UIText } from './ui/UIText';
import { UIButton } from './ui/UIButton';
import { UITextInput } from './ui/UITextInput';
import { useState, useEffect, useRef } from 'react';
import { useInputPopup } from '@/hooks/usePopup';
import { useThemeColor } from '@/hooks/useThemeColor';

export function InputPopup() {
    const {
        isVisible,
        title,
        description,
        placeholder,
        defaultValue,
        submitButtonText,
        handleDone,
    } = useInputPopup();

    const [inputValue, setInputValue] = useState(defaultValue);
    const highlightColor = useThemeColor({}, 'highlight');
    const textSecondaryColor = useThemeColor({}, 'textSecondary');

    const onCancel = () => {
        setInputValue(defaultValue);
        handleDone(null);
    };

    const onSubmit = (value: string) => {
        setInputValue(defaultValue);
        handleDone(value);
    };

    const isVisibleRef = useRef(isVisible);

    useEffect(() => {
        if (!!isVisible && isVisible !== isVisibleRef.current) {
            setInputValue(defaultValue);
        }
        isVisibleRef.current = isVisible;
    }, [defaultValue, isVisible]);

    return (
        <Modal
            visible={isVisible}
            transparent={true}
            animationType="fade"
            statusBarTranslucent={true}
            onRequestClose={onCancel}
        >
            <View style={styles.backdrop}>
                <UIView themeColor='backgroundSecondary' style={styles.container}>
                    <View style={styles.textContainer}>
                        <UIText size='xl' style={styles.title}>{title}</UIText>
                        {description && (
                            <UIText size='md' font='light' color='textSecondary'>{description}</UIText>
                        )}
                    </View>
                    <UITextInput
                        style={styles.input}
                        placeholder={placeholder}
                        value={inputValue}
                        onChangeText={setInputValue}
                        autoFocus
                    />
                    <View style={styles.buttonContainer}>
                        <UIButton
                            onPress={onCancel}
                            type="link"
                            title='Cancel'
                            color={textSecondaryColor}
                            style={styles.button}
                        />
                        <UIButton
                            onPress={() => onSubmit(inputValue)}
                            type='link'
                            title={submitButtonText}
                            color={highlightColor}
                            style={styles.buttonWithMargin}
                        />
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
    input: {
        marginHorizontal: 8,
        marginTop: 4,
        marginBottom: 8,
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
