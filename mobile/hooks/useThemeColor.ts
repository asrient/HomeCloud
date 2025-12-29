/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { ColorsIos, ColorsAndroid } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Platform } from 'react-native';

const Colors = Platform.OS === 'ios' ? ColorsIos : ColorsAndroid;

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
