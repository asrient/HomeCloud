import { View, type ViewProps, StyleProp, StyleSheet, ViewStyle, Platform } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemeColors } from '@/constants/Colors';

const isIos = Platform.OS === 'ios';

export type UIViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  themeColor?: keyof ThemeColors;
  useGlass?: boolean;
  borderRadius?: 'sm' | 'md' | 'lg' | 'full' | 'none';
};

export function UIView({ style, lightColor, darkColor, themeColor, useGlass, borderRadius = 'none', ...otherProps }: UIViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, themeColor || 'background');
  const shouldUseGlass = isLiquidGlassAvailable() && isIos && (useGlass ?? false);
  const effectiveStyle: StyleProp<ViewStyle> = StyleSheet.compose(
    {
      backgroundColor: shouldUseGlass ? 'transparent' : backgroundColor,
      borderRadius: borderRadius === 'sm' ? 8 :
        borderRadius === 'md' ? 12 :
          borderRadius === 'lg' ? 16 :
            borderRadius === 'full' ? 9999 : 0,
    },
    style,
  );
  return shouldUseGlass ? (
    <GlassView isInteractive style={effectiveStyle} {...otherProps} />
  ) : (
    <View style={effectiveStyle} {...otherProps} />
  );
}
