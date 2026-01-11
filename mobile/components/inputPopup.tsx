import { Modal, View, TextInput, StyleSheet } from 'react-native';
import { UIView } from './ui/UIView';
import { UIText } from './ui/UIText';
import { UIButton } from './ui/UIButton';
import { useState, useEffect, useRef } from 'react';
import { useInputPopup } from '@/hooks/usePopup';

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
            console.log('InputPopup opened with default value:', defaultValue);
            setInputValue(defaultValue);
        }
        isVisibleRef.current = isVisible;
    }, [defaultValue, isVisible]);

    // Android: render custom modal
    return (
        <Modal
            visible={isVisible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
        >
            <View style={styles.backdrop}>
                <UIView themeColor='backgroundSecondary' style={styles.container}>
                    <UIText style={styles.title}>{title}</UIText>
                    {description && (
                        <UIText style={styles.description}>{description}</UIText>
                    )}
                    <TextInput
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
                            title='CANCEL'
                        />
                        <UIButton
                            onPress={() => onSubmit(inputValue)}
                            type='link'
                            title={submitButtonText}
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
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        padding: 20,
        paddingBottom: 16,
        borderRadius: 12,
        gap: 6,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
    },
    description: {
        fontSize: 14,
        opacity: 0.7,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginTop: 6,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 6,
        justifyContent: 'flex-end',
    },
});
