import { Pressable, Platform, View, StyleSheet } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { useThemeColor } from '@/hooks/useThemeColor';
import { UIText } from './ui/UIText';
import { useState } from 'react';
import { isGlassEnabled } from '@/lib/utils';
import DeviceIcon from './deviceIcon';

const isIos = Platform.OS === 'ios';

export type DeviceButtonProps = {
  iconKey: string | null;
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  iconSize?: number;
};

export function DeviceButton({
  iconKey,
  title,
  onPress,
  disabled = false,
  iconSize = 56,
}: DeviceButtonProps) {
  const textColor = useThemeColor({}, 'text');
  const tertiaryBackgroundColor = useThemeColor({}, 'backgroundTertiary');
  const [isPressed, setIsPressed] = useState(false);

  const useGlass = isGlassEnabled;
  const backgroundColor = useGlass ? 'transparent' : tertiaryBackgroundColor;

  const content = (
    <>
      <DeviceIcon size={iconSize} iconKey={iconKey} />
      <UIText
        numberOfLines={1}
        size="xs"
        style={{ color: textColor, textAlign: 'center' }}
        font="medium"
      >
        {title}
      </UIText>
    </>
  );

  const viewStyle = [
    styles.container,
    !useGlass && { backgroundColor },
    { opacity: disabled ? 0.5 : isIos && !useGlass && isPressed ? 0.7 : 1 },
  ];

  return (
    <Pressable
      style={styles.pressable}
      onPress={onPress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      disabled={disabled}
    >
      {useGlass ? (
        <GlassView
          isInteractive={!disabled}
          style={viewStyle}
          tintColor={backgroundColor}
          glassEffectStyle="regular"
        >
          {content}
        </GlassView>
      ) : (
        <View style={viewStyle}>{content}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'stretch',
    width: '100%',
  },
  container: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: isIos ? 30 : 20,
    minHeight: 90,
  },
});
