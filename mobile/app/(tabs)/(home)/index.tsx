import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import DeviceSelectorRow from '@/components/deviceSelectorRow';
import DeviceIcon from '@/components/deviceIcon';
import { useAppState } from '@/hooks/useAppState';
import { UIText } from '@/components/ui/UIText';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import { UIScrollView } from '@/components/ui/UIScrollView';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DeviceInfo, PeerInfo } from 'shared/types';
import { DeviceQuickActions } from '@/components/deviceQuickActions';
import { isIos, isGlassEnabled, getAppName } from '@/lib/utils';
import { useAccountState } from '@/hooks/useAccountState';
import InstallLinkModal from '@/components/InstallLinkModal';

const MAX_DEVICE_NAME_LENGTH = 23;


function printDeviceInfo(info: DeviceInfo | null) {
  if (!info) return 'No Device Info';
  return `${info.os} ${info.osFlavour} • ${info.formFactor}`;
}

function DeviceInfoSection({ peerInfo, size = 200 }: { peerInfo: PeerInfo | null; size?: number }) {
  const [localPeerInfo, setLocalPeerInfo] = useState<PeerInfo | null>(null);

  useEffect(() => {
    if (!peerInfo) {
      modules.getLocalServiceController().app.peerInfo().then(setLocalPeerInfo);
    }
  }, [peerInfo]);

  const info = peerInfo || localPeerInfo;

  return (
    <>
      <DeviceIcon size={size} iconKey={info?.iconKey || null} />
      <UIText style={{ marginTop: 10, textAlign: 'center' }} type='subtitle' color='accentText' font='medium'>
        {info?.deviceName || modules.config.DEVICE_NAME}
      </UIText>
      <UIText style={{ textAlign: 'center', padding: 1 }} size='md' color='textSecondary' font='medium'>
        {printDeviceInfo(info?.deviceInfo || null)}
      </UIText>
    </>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [showInstallLink, setShowInstallLink] = useState(false);
  const installLinkShownRef = useRef(false);
  const { isLinked } = useAccountState();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isWide = screenWidth >= 768 && screenWidth > screenHeight;

  // Tab bar height is typically 49 on iOS and 56 on Android, plus safe area
  const tabBarHeight = (isIos ? 49 : 56) + insets.bottom;

  const { selectedPeer } = useAppState();

  const { peers } = useAppState();

  useEffect(() => {
    if (!installLinkShownRef.current && isLinked && peers.length === 0) {
      installLinkShownRef.current = true;
      setShowInstallLink(true);
    }
  }, [isLinked, peers.length]);

  const headerTitle = useMemo(() => {
    const deviceName = selectedPeer ? selectedPeer.deviceName : 'This Device';
    if (isWide) {
      return getAppName();
    }
    if (headerHeight > 118) {
      return getAppName();
    }
    if (deviceName.length > MAX_DEVICE_NAME_LENGTH) {
      return deviceName.substring(0, MAX_DEVICE_NAME_LENGTH - 3) + '...';
    }
    return deviceName;
  }, [headerHeight, selectedPeer, isWide]);

  return (
    <UIScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: 'Home',
          headerTitle,
          headerLargeTitle: !isWide,
          headerTransparent: isGlassEnabled,
          headerRight: () =>
            <View>
              <UIHeaderButton name="gear" onPress={() => router.navigate('/settings')} />
            </View>
          ,
        }}
      />
      <DeviceSelectorRow />
      <View style={[styles.container, { paddingBottom: tabBarHeight + (isIos ? 15 : 40) }]}>
        {isWide ? (
          <View style={styles.landscapeGrid}>
            <View style={styles.landscapeDeviceSection}>
              <DeviceInfoSection peerInfo={selectedPeer} />
            </View>
            <View style={styles.landscapeActionsSection}>
              <DeviceQuickActions peerInfo={selectedPeer} />
            </View>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <DeviceInfoSection peerInfo={selectedPeer} />
            </View>
            <DeviceQuickActions peerInfo={selectedPeer} />
          </>
        )}
      </View>
      <InstallLinkModal isOpen={showInstallLink} onClose={() => setShowInstallLink(false)} />
    </UIScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 6,
  },
  landscapeGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeDeviceSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  landscapeActionsSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
