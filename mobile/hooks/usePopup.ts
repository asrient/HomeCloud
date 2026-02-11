import { useCallback } from "react";
import { Platform, Alert } from "react-native";
import { create } from 'zustand'


export type InputPopupOpts = {
    title: string;
    description?: string;
    placeholder?: string;
    defaultValue?: string;
    submitButtonText?: string;
    onDone: (value: string | null) => void;
};

interface InputPopupState {
    isVisible: boolean;
    title: string;
    description: string | undefined;
    placeholder: string;
    defaultValue: string;
    submitButtonText: string;
    onDone: ((value: string | null) => void) | undefined;
    setPopupState: (options: Partial<InputPopupOpts> & { isVisible: boolean }) => void;
    reset: () => void;
}

export const useInputPopupStore = create<InputPopupState>((set) => ({
    isVisible: false,
    title: '',
    description: undefined,
    placeholder: '',
    defaultValue: '',
    submitButtonText: 'Submit',
    onDone: undefined,
    setPopupState: (options) => set((state) => ({
        isVisible: options.isVisible,
        title: options.title ?? state.title,
        description: options.description ?? state.description,
        placeholder: options.placeholder ?? state.placeholder,
        defaultValue: options.defaultValue ?? state.defaultValue,
        submitButtonText: options.submitButtonText ?? state.submitButtonText,
        onDone: options.onDone ?? state.onDone,
    })),
    reset: () => set(() => ({
        isVisible: false,
        title: '',
        description: undefined,
        placeholder: '',
        defaultValue: '',
        submitButtonText: 'Submit',
        onDone: undefined,
    })),
}));

export function useInputPopup() {
    const { isVisible, title, description, placeholder, defaultValue, submitButtonText, onDone, setPopupState, reset } = useInputPopupStore();

    const openInputPopup = useCallback((options: InputPopupOpts) => {
        if (Platform.OS === 'ios') {
            Alert.prompt(
                options.title,
                options.description,
                [
                    {
                        text: 'Cancel',
                        style: 'cancel',
                        onPress: () => {
                            options.onDone(null);
                        },
                    },
                    {
                        text: options.submitButtonText || 'Submit',
                        onPress: (value?: string) => {
                            options.onDone(value || '');
                        },
                    },
                ],
                'plain-text',
                options.defaultValue || ''
            );
        } else {
            setPopupState({
                isVisible: true,
                title: options.title,
                description: options.description,
                placeholder: options.placeholder || '',
                defaultValue: options.defaultValue || '',
                submitButtonText: options.submitButtonText?.toUpperCase() || 'DONE',
                onDone: options.onDone,
            });
            console.log('Opening input popup on iOS');
        }
    }, [setPopupState]);

    const handleDone = useCallback((value: string | null) => {
        if (onDone) {
            onDone(value);
        }
        reset();
    }, [onDone, reset]);

    return {
        isVisible,
        title,
        description,
        placeholder,
        defaultValue,
        submitButtonText,
        openInputPopup,
        handleDone,
    };
}
