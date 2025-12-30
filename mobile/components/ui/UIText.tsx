import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemeColors } from '@/constants/Colors';

export type UITextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:  'title'  | 'subtitle' | 'default' | 'defaultSemiBold';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  font?: 'bold' | 'regular' | 'semibold' | 'light' | 'medium';
  color?: keyof ThemeColors;
};

export function UIText({
  style,
  lightColor,
  darkColor,
  color,
  size,
  font,
  type = 'default',
  ...rest
}: UITextProps) {
  const textColor = useThemeColor({ light: lightColor, dark: darkColor }, color || 'text');

  return (
    <Text
      style={[
        { color: textColor },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        size === 'sm' ? styles.sm : undefined,
        size === 'xs' ? styles.xs : undefined,
        size === 'md' ? styles.md : undefined,
        size === 'lg' ? styles.lg : undefined,
        size === 'xl' ? styles.xl : undefined,
        size === 'xxl' ? styles.xxl : undefined,
        font === 'bold' ? styles.bold : undefined,
        font === 'regular' ? styles.regular : undefined,
        font === 'semibold' ? styles.semibold : undefined,
        font === 'light' ? styles.light : undefined,
        font === 'medium' ? styles.medium : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  xxl: {
    fontSize: 26,
    lineHeight: 32,
  },
  xl: {
    fontSize: 22,
    lineHeight: 28,
  },
  lg: {
    fontSize: 18,
    lineHeight: 26,
  },
  md: {
    fontSize: 16,
    lineHeight: 24,
  },
  sm: {
    fontSize: 14,
    lineHeight: 20,
  },
  xs: {
    fontSize: 12,
    lineHeight: 18,
  },
  bold: {
    fontWeight: 'bold',
  },
  regular: {
    fontWeight: '400',
  },
  medium: {
    fontWeight: '500',
  },
  semibold: {
    fontWeight: '600',
  },
  light: {
    fontWeight: '300',
  },
});
