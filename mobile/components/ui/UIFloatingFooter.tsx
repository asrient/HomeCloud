import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View, ViewStyle } from 'react-native';

interface UIFloatingFooterProps {
    children: React.ReactNode;
    /** Minimum distance from the bottom when keyboard is hidden (default: 20) */
    minBottom?: number;
    /** Horizontal padding (default: 20) */
    horizontalPadding?: number;
    style?: ViewStyle;
}

/**
 * A footer that floats above the keyboard.
 * Absolutely positioned at the bottom of its parent, moves up when the keyboard appears.
 */
export function UIFloatingFooter({
    children,
    minBottom = 20,
    horizontalPadding = 20,
    style,
}: UIFloatingFooterProps) {
    const [keyboardHeight, setKeyboardHeight] = useState(0);

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
                styles.footer,
                {
                    bottom: Math.max(keyboardHeight, minBottom),
                    left: horizontalPadding,
                    right: horizontalPadding,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    footer: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
