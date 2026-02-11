import { useEffect, useState } from 'react';
import { Keyboard, Platform, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UIFloatingBarProps {
    children: React.ReactNode;
    /** Extra gap above the keyboard when floating (default: 5) */
    keyboardOffset?: number;
    /** Horizontal padding when floating (default: 10) */
    floatingHorizontalPadding?: number;
    style?: ViewStyle;
}

/**
 * A bar that stays in normal flow by default.
 * When the keyboard is visible, it becomes absolutely positioned and floats above the keyboard.
 * Uses safe area insets to dynamically account for system navigation bars.
 */
export function UIFloatingBar({
    children,
    keyboardOffset = 5,
    floatingHorizontalPadding = 10,
    style,
}: UIFloatingBarProps) {
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const isKeyboardVisible = keyboardHeight > 0;
    const insets = useSafeAreaInsets();

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

    // On Android the keyboard height from keyboardDidShow doesn't always
    // account for the system navigation bar, so we add the bottom inset.
    const bottomOffset = Platform.OS === 'android'
        ? keyboardHeight + insets.bottom + keyboardOffset
        : keyboardHeight + keyboardOffset;

    return (
        <View
            style={[
                isKeyboardVisible && {
                    position: 'absolute',
                    left: floatingHorizontalPadding,
                    right: floatingHorizontalPadding,
                    bottom: bottomOffset,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}
