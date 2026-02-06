import { useEffect, useState } from 'react';
import { Keyboard, Platform, View, ViewStyle } from 'react-native';

interface UIFloatingBarProps {
    children: React.ReactNode;
    /** Distance from the bottom when keyboard is visible (default: 20) */
    keyboardBottom?: number;
    /** Horizontal padding when floating (default: 20) */
    floatingHorizontalPadding?: number;
    style?: ViewStyle;
}

/**
 * A bar that stays in normal flow by default.
 * When the keyboard is visible, it becomes absolutely positioned and floats above the keyboard.
 */
export function UIFloatingBar({
    children,
    keyboardBottom = 5,
    floatingHorizontalPadding = 10,
    style,
}: UIFloatingBarProps) {
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const isKeyboardVisible = keyboardHeight > 0;

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
        const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    return (
        <View
            style={[
                isKeyboardVisible && {
                    position: 'absolute',
                    left: floatingHorizontalPadding,
                    right: floatingHorizontalPadding,
                    bottom: keyboardHeight + keyboardBottom,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}
