import { ThemeColors } from '@/constants/Colors';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

export function UIIcon({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
  themeColor,
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
  themeColor?: keyof ThemeColors;
}) {
  const themeColorValue = useThemeColor({}, themeColor || 'icon');
  return (
    <SymbolView
      weight={weight}
      tintColor={color || themeColorValue}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
