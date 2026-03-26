import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useAppState } from '@/hooks/useAppState';
import { UIText } from '@/components/ui/UIText';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import { UIScrollView } from '@/components/ui/UIScrollView';
import { UIView } from '@/components/ui/UIView';
import { UIIcon } from '@/components/ui/UIIcon';
import { DeviceTile } from '@/components/DeviceTile';
import { UIButton } from '@/components/ui/UIButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useMemo, useState } from 'react';
import { PeerInfo } from 'shared/types';
import { isGlassEnabled, getAppName, getBottomPadding } from '@/lib/utils';
import { useAccountState } from '@/hooks/useAccountState';
import { useDiscoverable } from '@/hooks/useDiscoverable';
import { useThemeColor } from '@/hooks/useThemeColor';
import InstallLinkModal from '@/components/InstallLinkModal';

function DiscoverableSection() {
  const { isDiscoverable, isWebActive, isLocalActive, isWebEnabled, isLocalEnabled } = useDiscoverable();
  const highlightColor = useThemeColor({}, 'highlight');
  const [deviceName, setDeviceName] = useState<string>('This Device');

  useEffect(() => {
    modules.getLocalServiceController().app.peerInfo().then((info) => {
      setDeviceName(info.deviceName || modules.config.DEVICE_NAME);
    });
  }, []);

  const getHeroSubtitle = (): string => {
    if (!isLocalEnabled && !isWebEnabled) {
      return 'No connections allowed.';
    }
    if (isDiscoverable) {
      let onTxt = '';
      if (isLocalActive && !isWebActive) {
        onTxt = 'on this network';
      } else if (!isLocalActive && isWebActive) {
        onTxt = 'on web';
      }
      if (onTxt) {
        onTxt += ' ';
      }
      return `Discoverable ${onTxt}as "${deviceName}".`;
    }
    return 'Turn on Wi-Fi or mobile data.';
  };

  const getWarningMessage = (): string | null => {
    if (!isLocalEnabled && !isWebEnabled) {
      return 'Please enable at least one connection method to make your device discoverable.';
    }
    if (!isLocalEnabled) {
      return 'Local Network is disabled. Devices on the same network may have trouble discovering this device.';
    }
    if (!isWebEnabled) {
      return 'Web Connect is disabled. Devices not on the same Wi-Fi won\'t be able to discover this device.';
    }
    return null;
  };

  const warningMessage = getWarningMessage();

  return (
    <>
      <View style={styles.discoverableSection}>
        <View style={{ alignItems: 'center', flexDirection: 'row' }}>
          <UIIcon
            name={isDiscoverable ? 'antenna.radiowaves.left.and.right' : 'personalhotspot.slash'}
            size={24}
            color={highlightColor}
            themeColor={isDiscoverable ? undefined : 'textSecondary'}
          />
          <UIText size="md" font="semibold" style={{ marginLeft: 8 }}>
            {isDiscoverable ? 'Discoverable' : 'Not Discoverable'}
          </UIText>
        </View>
        <UIText size="sm" color="textSecondary" style={{ marginTop: 4, textAlign: 'center' }}>
          {getHeroSubtitle()}
        </UIText>
      </View>
      {warningMessage && (
        <UIView themeColor="backgroundSecondary" style={styles.warningCard}>
          <UIIcon name="exclamationmark.triangle" size={24} themeColor="textSecondary" />
          <UIText size="sm" color="textSecondary" style={{ flex: 1 }}>
            {warningMessage}
          </UIText>
        </UIView>
      )}
    </>
  );
}

function ThisDeviceCard({ onPress }: { onPress: () => void }) {
  const [deviceName, setDeviceName] = useState<string>('This Device');
  const [localPeerInfo, setLocalPeerInfo] = useState<PeerInfo | null>(null);
  const { deviceInfo } = useAppState();

  useEffect(() => {
    modules.getLocalServiceController().app.peerInfo().then((info) => {
      setDeviceName(info.deviceName || modules.config.DEVICE_NAME);
      setLocalPeerInfo(info);
    });
  }, []);

  const deviceInfoText = deviceInfo
    ? `${deviceInfo.os} ${deviceInfo.osFlavour || ''} • ${deviceInfo.formFactor}`.trim()
    : '';

  return (
    <View style={styles.section}>
      <UIText type="subtitle" style={styles.sectionTitle}>This Device</UIText>
      <DeviceTile
        iconKey={localPeerInfo?.iconKey || null}
        title={deviceName}
        subtitle={deviceInfoText || undefined}
        onPress={onPress}
      />
    </View>
  );
}



export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = getBottomPadding(insets.bottom);
  const { isLinked } = useAccountState();
  const { peers } = useAppState();
  const [installLinkOpen, setInstallLinkOpen] = useState(false);
  const headerHeight = useHeaderHeight();
  const { width: screenWidth } = useWindowDimensions();

  const showAddDevice = !isLinked || peers.length === 0;

  const GAP = 10;
  const PADDING = 16;
  const gridColumns = useMemo(() => {
    if (screenWidth >= 900) return 3;
    if (screenWidth >= 600) return 2;
    return 1;
  }, [screenWidth]);
  const availableWidth = screenWidth - PADDING * 2;
  const itemWidth = (availableWidth - GAP * (gridColumns - 1)) / gridColumns;

  return (
    <UIScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: bottomPadding + 20, flexGrow: 1 }}>
      <Stack.Screen
        options={{
          title: 'Home',
          headerTitle: getAppName(),
          headerLargeTitle: true,
          headerTransparent: isGlassEnabled,
          headerRight: () => (
            <UIHeaderButton name="gear" onPress={() => router.navigate('/settings')} />
          ),
        }}
      />

      {isGlassEnabled && <View style={{ height: headerHeight }} />}
      <View style={styles.container}>

        {/* This Device */}
        <ThisDeviceCard onPress={() => router.navigate({ pathname: '/device-sheet', params: { fingerprint: 'local' } } as any)} />

        {/* My Devices */}
        {peers.length > 0 && (
          <View style={styles.section}>
            <UIText type="subtitle" style={styles.sectionTitle}>My Devices</UIText>
            <View style={styles.devicesGrid}>
              {peers.map((peer) => {
                const di = peer.deviceInfo;
                const subtitle = di
                  ? `${di.os} ${di.osFlavour || ''} • ${di.formFactor}`.trim()
                  : undefined;
                return (
                  <View key={peer.fingerprint} style={{ width: itemWidth }}>
                    <DeviceTile
                      iconKey={peer.iconKey}
                      title={peer.deviceName}
                      subtitle={subtitle}
                      onPress={() => router.navigate({ pathname: '/device-sheet', params: { fingerprint: peer.fingerprint } } as any)}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Add Device */}
        {showAddDevice && (
          <View style={styles.addDeviceSection}>
            <UIButton
              icon="plus.circle"
              title="Add device"
              type="secondary"
              size="md"
              onPress={() => isLinked ? setInstallLinkOpen(true) : router.navigate('/login')}
            />
          </View>
        )}

        <View style={{ flex: 1 }} />

        {/* Discoverable Status */}
        <DiscoverableSection />
      </View>
      <InstallLinkModal isOpen={installLinkOpen} onClose={() => setInstallLinkOpen(false)} />
    </UIScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  discoverableSection: {
    marginVertical: 10,
    padding: 20,
    alignItems: 'center',
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
    borderRadius: 16,
    gap: 12,
  },
  section: {
    marginVertical: 15,
  },
  sectionTitle: {
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  devicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  addDeviceSection: {
    alignItems: 'center',
    marginVertical: 10,
  },
});
