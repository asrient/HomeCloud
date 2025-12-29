import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemeColors } from '@/constants/Colors';

export type UIViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  themeColor?: keyof ThemeColors;
};

export function UIView({ style, lightColor, darkColor, themeColor, ...otherProps }: UIViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, themeColor || 'background');
  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
