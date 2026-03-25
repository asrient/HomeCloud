import { Pressable, View, StyleSheet } from 'react-native';
import DeviceIcon from './deviceIcon';
import { UIText } from './ui/UIText';
import { useThemeColor } from '@/hooks/useThemeColor';

export type DeviceTileProps = {
  iconKey: string | null;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  showDivider?: boolean;
};

export function DeviceTile({ iconKey, title, subtitle, onPress, showDivider = true }: DeviceTileProps) {
  const dividerColor = useThemeColor({}, 'seperator');

  return (
    <Pressable onPress={onPress}>
      <View style={styles.tile}>
        <DeviceIcon size={50} iconKey={iconKey} />
        <View style={styles.textContainer}>
          <UIText size="md" font="medium" numberOfLines={1}>{title}</UIText>
          {subtitle ? (
            <UIText size="sm" color="textSecondary" numberOfLines={1}>{subtitle}</UIText>
          ) : null}
        </View>
        {/* <UIIcon name="chevron.right" size={16} themeColor="textSecondary" /> */}
      </View>
      {showDivider && <View style={[styles.divider, { backgroundColor: dividerColor }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    marginLeft: 12,
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
  },
});
