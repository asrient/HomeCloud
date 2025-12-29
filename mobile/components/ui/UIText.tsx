import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemeColors } from '@/constants/Colors';

export type UITextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'; // deprecated use size and color instead
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
  
  if (size) {
    type = size;
  }

  return (
    <Text
      style={[
        { color: textColor },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'sm' ? styles.sm : undefined,
        type === 'xs' ? styles.xs : undefined,
        type === 'md' ? styles.md : undefined,
        type === 'lg' ? styles.lg : undefined,
        type === 'xl' ? styles.xl : undefined,
        type === 'xxl' ? styles.xxl : undefined,
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
