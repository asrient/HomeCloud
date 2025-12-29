import { ScrollView, type ScrollViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';

export type UIScrollViewProps = ScrollViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function UIScrollView({ style, lightColor, darkColor, ...otherProps }: UIScrollViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return <ScrollView style={[{ backgroundColor }, style]} {...otherProps} />;
}
