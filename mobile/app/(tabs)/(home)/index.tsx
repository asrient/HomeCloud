import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import DeviceSelectorRow from '@/components/deviceSelectorRow';
import DeviceIcon from '@/components/deviceIcon';
import { useAppState } from '@/hooks/useAppState';
import { UIText } from '@/components/ui/UIText';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import { UIScrollView } from '@/components/ui/UIScrollView';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useMemo, useState } from 'react';
import { DeviceInfo } from 'shared/types';
import { DeviceQuickActions } from '@/components/deviceQuickActions';
import { isIos, getAppName } from '@/lib/utils';

const MAX_DEVICE_NAME_LENGTH = 23;


function printDeviceInfo(info: DeviceInfo | null) {
  if (!info) return 'No Device Info';
  return `${info.os} ${info.osFlavour} • ${info.formFactor}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [thisDeviceInfo, setThisDeviceInfo] = useState<DeviceInfo | null>(null);
  
  // Tab bar height is typically 49 on iOS and 56 on Android, plus safe area
  const tabBarHeight = (isIos ? 49 : 56) + insets.bottom;

  useEffect(() => {
    modules.getLocalServiceController().system.getDeviceInfo().then(setThisDeviceInfo);
  }, []);

  const { selectedPeer } = useAppState();

  const headerTitle = useMemo(() => {
    const deviceName = selectedPeer ? selectedPeer.deviceName : 'This Device';
    if (headerHeight > 118) {
      return getAppName();
    }
    if (deviceName.length > MAX_DEVICE_NAME_LENGTH) {
      return deviceName.substring(0, MAX_DEVICE_NAME_LENGTH - 3) + '...';
    }
    return deviceName;
  }, [headerHeight, selectedPeer]);

  return (
    <UIScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: 'Home',
          headerTitle,
          headerLargeTitle: true,
          headerTransparent: isIos,
          headerRight: () =>
            <View>
              <UIHeaderButton name="gear" onPress={() => router.navigate('/settings')} />
            </View>
          ,
        }}
      />
      <DeviceSelectorRow />
      <View style={[styles.container, { paddingBottom: tabBarHeight + 40 }]}>
        <View style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <DeviceIcon size={200} iconKey={selectedPeer ? selectedPeer.iconKey : null} />
          <UIText style={{ marginTop: 10, textAlign: 'center' }} type='subtitle' color='accentText' font='medium'>
            {selectedPeer ? selectedPeer.deviceName : modules.config.DEVICE_NAME}
          </UIText>
          <UIText style={{ textAlign: 'center', padding: 1 }} size='md' color='textSecondary' font='medium'>
            {printDeviceInfo(selectedPeer ? selectedPeer.deviceInfo : thisDeviceInfo)}
          </UIText>
        </View>
        <DeviceQuickActions peerInfo={selectedPeer} />
      </View>
    </UIScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 6,
  },
});
