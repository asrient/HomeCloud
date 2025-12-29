import { Pressable, Platform, View, ViewStyle, StyleSheet, StyleProp } from "react-native";
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useThemeColor } from "@/hooks/useThemeColor";
import { IconSymbolName, UIIcon } from "./UIIcon";
import { UIText, UITextProps } from "./UIText";
import { useState } from "react";


export type UIButtonProps = {
    type?: 'primary' | 'secondary' | 'outline' | 'link';
    color?: string;
    onPress?: () => void;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    children?: React.ReactNode;
    title?: string;
    icon?: IconSymbolName;
    style?: ViewStyle;
    stretch?: boolean;
    iconSize?: number;
    textSize?: UITextProps['size'];
    marginHorizontal?: number;
    marginVertical?: number;
    margin?: number;
}

const isIos = Platform.OS === 'ios';

export function UIButton({
    type = 'primary',
    color,
    onPress,
    disabled = false,
    size = 'md',
    children,
    title,
    icon,
    stretch = false,
    iconSize,
    textSize,
    style,
    marginHorizontal,
    marginVertical,
    margin,
}: UIButtonProps) {
    const highlightColor = useThemeColor({}, 'highlight');
    const highlightTextColor = useThemeColor({}, 'highlightText');
    const textColor = useThemeColor({}, 'text');
    const tertiaryBackgroundColor = useThemeColor({}, 'backgroundTertiary');
    const [isPressed, setIsPressed] = useState(false);

    const useGlass = isLiquidGlassAvailable() && isIos && (type === 'primary' || type === 'secondary');

    let buttonColor = type === 'primary' ? highlightColor : type === 'secondary' ? (useGlass ? 'transparent' : tertiaryBackgroundColor) : 'transparent';
    let contentColor = type === 'primary' ? highlightTextColor : type === 'secondary' ? textColor : highlightColor;
    let borderColor = type === 'outline' ? highlightColor : null;
    if (color) {
        if (type === 'outline') {
            borderColor = color;
        }
        if (type === 'primary') {
            buttonColor = color;
        } else {
            contentColor = color;
        }
    }

    const content = (<>
        {icon && <UIIcon name={icon} size={iconSize ?? (size === 'xl' ? 28 : 22)} color={contentColor} style={{ marginRight: title ? 6 : 0 }} />}
        {
        title && <UIText
            size={textSize ?? (size === 'xl' ? 'lg' : 'md')}
            style={{ color: contentColor }}
            font='medium'>
            {title}
        </UIText>
        }
        {children}
    </>)

    
    const isIconOnly = !!icon && !title && !children;

    const paddingVertical = size === 'sm' ? 6 : size === 'md' ? 10 : size === 'lg' ? 14 : 18;
    const paddingHorizontal = isIconOnly ? paddingVertical : size === 'sm' ? 12 : size === 'md' ? 16 : size === 'lg' ? 20 : 24;

    let viewStyle: StyleProp<ViewStyle> = StyleSheet.compose({
        alignSelf: stretch ? 'stretch' : 'auto',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical,
        paddingHorizontal,
        borderRadius: isIos ? 100 : 8,
        borderWidth: borderColor ? 2 : 0,
        borderColor: borderColor || 'transparent',
        opacity: disabled ? 0.5 : isIos && !useGlass && isPressed ? 0.7 : 1,
    }, style);

    if (!useGlass) {
        viewStyle = StyleSheet.compose(viewStyle, { backgroundColor: buttonColor } );
    }

    marginHorizontal = marginHorizontal ?? margin ?? 4;
    marginVertical = marginVertical ?? margin ?? 4;

    return (
        <Pressable
            style={{ marginHorizontal, marginVertical, alignSelf: stretch ? 'stretch' : 'auto' }}
            onPress={onPress}
            onPressIn={() => setIsPressed(true)}
            onPressOut={() => setIsPressed(false)}
            disabled={disabled}>
            {
                useGlass ? (
                    <GlassView
                        isInteractive={!disabled}
                        style={viewStyle}
                        tintColor={buttonColor}
                    >
                        {content}
                    </GlassView>
                ) : (
                    <View style={viewStyle}>{content}</View>
                )
            }
        </Pressable>
    );
}
