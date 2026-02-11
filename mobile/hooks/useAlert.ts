import { useCallback } from "react";
import { Platform, Alert, AlertButton } from "react-native";
import { create } from 'zustand'

export type AlertButtonConfig = {
    text: string;
    style?: 'default' | 'cancel' | 'destructive';
    onPress?: () => void;
};

export type AlertOptions = {
    title: string;
    message?: string;
    buttons?: AlertButtonConfig[];
};

interface AlertState {
    isVisible: boolean;
    title: string;
    message: string | undefined;
    buttons: AlertButtonConfig[];
    setAlertState: (options: Partial<AlertOptions> & { isVisible: boolean }) => void;
    reset: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
    isVisible: false,
    title: '',
    message: undefined,
    buttons: [],
    setAlertState: (options) => set((state) => ({
        isVisible: options.isVisible,
        title: options.title ?? state.title,
        message: options.message ?? state.message,
        buttons: options.buttons ?? state.buttons,
    })),
    reset: () => set(() => ({
        isVisible: false,
        title: '',
        message: undefined,
        buttons: [],
    })),
}));

export function useAlert() {
    const { isVisible, title, message, buttons, setAlertState, reset } = useAlertStore();

    const showAlert = useCallback((
        alertTitle: string,
        alertMessage?: string,
        alertButtons?: AlertButtonConfig[]
    ) => {
        const defaultButtons: AlertButtonConfig[] = alertButtons || [{ text: 'OK' }];

        console.log('[useAlert] showAlert called:', alertTitle, 'Platform:', Platform.OS);

        if (Platform.OS === 'ios') {
            // Use native Alert on iOS
            const iosButtons: AlertButton[] = defaultButtons.map(btn => ({
                text: btn.text,
                style: btn.style,
                onPress: btn.onPress,
            }));
            Alert.alert(alertTitle, alertMessage, iosButtons);
        } else {
            // Use custom modal on Android
            console.log('[useAlert] Setting Android modal state');
            setAlertState({
                isVisible: true,
                title: alertTitle,
                message: alertMessage,
                buttons: defaultButtons,
            });
        }
    }, [setAlertState]);

    const handleButtonPress = useCallback((button: AlertButtonConfig) => {
        if (button.onPress) {
            button.onPress();
        }
        reset();
    }, [reset]);

    const handleDismiss = useCallback(() => {
        // Find cancel button and call its onPress, or just dismiss
        const cancelButton = buttons.find(b => b.style === 'cancel');
        if (cancelButton?.onPress) {
            cancelButton.onPress();
        }
        reset();
    }, [buttons, reset]);

    return {
        isVisible,
        title,
        message,
        buttons,
        showAlert,
        handleButtonPress,
        handleDismiss,
    };
}
