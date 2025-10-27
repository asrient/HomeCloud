import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';

export type UIViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function UIView({ style, lightColor, darkColor, ...otherProps }: UIViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
