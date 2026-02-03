import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { useAppState } from '@/hooks/useAppState';
import { useAutoConnect } from '@/hooks/useAutoConnect';
import { useThemeColor } from '@/hooks/useThemeColor';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';


export default function TabLayout() {
  const router = useRouter();

  // Get colors for NativeTabs
  const backgroundColor = useThemeColor({}, 'backgroundSecondary');
  const indicatorColor = useThemeColor({}, 'backgroundTertiary');
  const tintColor = useThemeColor({}, 'highlight');
  const iconColor = useThemeColor({}, 'textSecondary');
  const selectedIconColor = useThemeColor({}, 'accentText');
  const rippleColor = useThemeColor({}, 'primaryRipple');

  const { selectedFingerprint } = useAppState();
  useAutoConnect(selectedFingerprint, 'app');

  useEffect(() => {
    const localSc = modules.getLocalServiceController();
    if (!localSc.app.isOnboarded()) {
      // Navigate to the welcome screen
      console.log('Navigating to welcome screen');
      router.navigate('/welcome');
    }
  }, [router]);

  // Only apply custom colors on Android
  const tabProps = Platform.OS === 'android' ? {
    backgroundColor,
    indicatorColor,
    tintColor,
    iconColor: { default: iconColor, selected: selectedIconColor },
    labelStyle: { color: iconColor },
    rippleColor,
  } : {
    tintColor,
  };

  return (
    <NativeTabs {...tabProps}>
      <NativeTabs.Trigger name="(home)">
        <Label>Home</Label>
        <Icon sf="house.fill" androidSrc={<VectorIcon family={MaterialIcons} name="home" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="photos">
        <Icon sf="photo.stack" androidSrc={<VectorIcon family={MaterialIcons} name="photo-library" />} />
        <Label>Photos</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="files">
        <Icon sf="folder.fill" androidSrc={<VectorIcon family={MaterialIcons} name="folder" />} />
        <Label>Files</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
