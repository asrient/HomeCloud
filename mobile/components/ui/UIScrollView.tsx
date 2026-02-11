import { ScrollView, type ScrollViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemeColors } from '@/constants/Colors';

export type UIScrollViewProps = ScrollViewProps & {
  lightColor?: string;
  darkColor?: string;
  themeColor?: keyof ThemeColors;
};

export function UIScrollView({ style, lightColor, darkColor, themeColor, ...otherProps }: UIScrollViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, themeColor || 'background');
  return <ScrollView style={[{ backgroundColor }, style]} {...otherProps} />;
}
