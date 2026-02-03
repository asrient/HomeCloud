import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemeColors } from '@/constants/Colors';

export type UITextInputVariant = 'outlined' | 'filled' | 'plain';

export type UITextInputProps = TextInputProps & {
    lightColor?: string;
    darkColor?: string;
    variant?: UITextInputVariant;
    color?: keyof ThemeColors;
};

export function UITextInput({
    style,
    lightColor,
    darkColor,
    variant = 'outlined',
    color,
    placeholderTextColor,
    ...rest
}: UITextInputProps) {
    const textColor = useThemeColor({ light: lightColor, dark: darkColor }, color || 'text');
    const highlightColor = useThemeColor({}, 'highlight');
    const textSecondaryColor = useThemeColor({}, 'textSecondary');
    const borderColor = useThemeColor({}, 'seperator');
    const backgroundColor = useThemeColor({}, 'backgroundTertiary');

    const variantStyle = variant === 'outlined'
        ? [styles.outlined, { borderColor }]
        : variant === 'filled'
            ? [styles.filled, { backgroundColor }]
            : styles.plain;

    return (
        <TextInput
            style={[
                styles.base,
                variantStyle,
                { color: textColor },
                style,
            ]}
            placeholderTextColor={placeholderTextColor ?? textSecondaryColor}
            selectionColor={highlightColor}
            cursorColor={highlightColor}
            {...rest}
        />
    );
}

const styles = StyleSheet.create({
    base: {
        fontSize: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    outlined: {
        borderWidth: 1.5,
        borderRadius: 12,
    },
    filled: {
        borderRadius: 12,
    },
    plain: {
        // No border or background
    },
});
