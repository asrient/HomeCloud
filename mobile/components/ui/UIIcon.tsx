// Fallback for using MaterialIcons on Android and web.

import { ThemeColors } from '@/constants/Colors';
import { useThemeColor } from '@/hooks/useThemeColor';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
export type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'at': 'alternate-email',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'arrow-back',
  'gearshape.fill': 'settings',
  'gear': 'settings',
  'wifi': 'wifi',
  'cellularbars': 'signal-cellular-4-bar',
  'checkmark': 'check',
  'checkmark.circle': 'check-circle-outline',
  'checkmark.circle.fill': 'check-box',
  'xmark': 'close',
  'xmark.circle': 'cancel',
  'folder.fill': 'folder',
  'trash': 'delete-outline',
  'square.and.arrow.up': 'share',
  'ellipsis': 'more-horiz',
  'ellipsis.circle': 'more-horiz',
  'chevron.compact.forward': 'chevron-right',
  'iphone': 'smartphone',
  'iphone.gen1': 'smartphone',
  'laptopcomputer': 'laptop',
  'desktopcomputer': 'desktop-mac',
  'macbook.and.iphone': 'devices',
  'folder.badge.plus': 'create-new-folder',
  'plus.circle': 'add-circle-outline',
  'ipad.landscape': 'tablet',
  'smartphone': 'smartphone',
  'tv': 'tv',
  'arrow.up.message': 'arrow-upward',
  'paperclip': 'attach-file',
  'battery.0percent': 'battery-alert',
  'battery.25percent': 'battery-2-bar',
  'battery.50percent': 'battery-5-bar',
  'battery.75percent': 'battery-6-bar',
  'battery.100percent': 'battery-full',
  'personalhotspot': 'wifi-tethering',
  'personalhotspot.slash': 'portable-wifi-off',
  'network': 'cell-tower',
  'speaker.wave.2.fill': 'volume-down',
  'clipboard': 'content-paste',
  'play.fill': 'play-arrow',
  'pause.fill': 'pause',
  'backward.fill': 'skip-previous',
  'forward.fill': 'skip-next',
  'arrow.up.circle.fill': 'send',
  'externaldrive.fill': 'sd-storage',
  'antenna.radiowaves.left.and.right': 'cell-tower',
  'cloud.rain': 'cloud',
  'play.circle': 'play-circle-outline',
  'envelope.badge': 'mail',
  'exclamationmark.triangle': 'warning',
  'photo.stack': 'collections',
  'arrow.left.arrow.right': 'swap-horiz',
  'lock.shield': 'lock',
  'text.bubble.fill': 'chat',
  'macwindow': 'web-asset',
  'macwindow.on.rectangle': 'picture-in-picture-alt',
  'keyboard': 'keyboard',
  'keyboard.fill': 'keyboard',
  'hand.tap.fill': 'touch-app',
  'cursorarrow': 'mouse',
  'cursorarrow.click': 'mouse',
  'rectangle.grid.2x2.fill': 'grid-view',
  'squareshape.split.2x2': 'grid-view',
  'app.fill': 'apps',
  'eye.fill': 'visibility',
  'eye.slash.fill': 'visibility-off',
  'hand.raised.fill': 'pan-tool',
  'arrow.uturn.backward': 'undo',
  'scroll': 'swap-vert',
  'hand.draw.fill': 'gesture',
  'pointer.arrow.ipad': 'near-me',
  'selection.pin.in.out': 'crop',
  'rotate.right': 'rotate-right',
  'display': 'desktop-windows',
  'terminal.fill': 'terminal',
  'lock.fill': 'lock',
  'clock': 'schedule',
  'clock.fill': 'schedule',
  'nosign': 'block',
  'doc.text': 'description',
  'bolt.fill': 'bolt',
  'sparkles.2': 'auto-awesome',
  'command': 'keyboard-command',
  'slider.horizontal.3': 'tune',
  'plus': 'add',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function UIIcon({
  name,
  size = 24,
  color,
  themeColor,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color?: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
  themeColor?: keyof ThemeColors;
}) {
  const themeColorValue = useThemeColor({}, themeColor || 'icon');
  return <MaterialIcons color={color || themeColorValue} size={size} name={MAPPING[name]} style={style} />;
}
