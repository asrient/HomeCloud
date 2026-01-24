import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { useAppState } from '@/hooks/useAppState';
import { useAutoConnect } from '@/hooks/useAutoConnect';


export default function TabLayout() {
  const router = useRouter();

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

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="(home)">
        <Label>Home</Label>
        <Icon sf="house.fill" drawable="custom_android_drawable" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="photos">
        <Icon sf="photo.stack" drawable="custom_photos_drawable" />
        <Label>Photos</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="files">
        <Icon sf="folder.fill" drawable="custom_folder_drawable" />
        <Label>Files</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
