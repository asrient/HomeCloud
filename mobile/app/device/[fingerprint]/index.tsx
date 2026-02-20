import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View, useWindowDimensions, KeyboardAvoidingView } from 'react-native';
import DeviceIcon from '@/components/deviceIcon';
import { useAppState } from '@/hooks/useAppState';
import { UIText } from '@/components/ui/UIText';
import { UIScrollView } from '@/components/ui/UIScrollView';
import { useEffect, useMemo, useState } from 'react';
import { DeviceInfo, PeerInfo } from 'shared/types';
import { DeviceQuickActions } from '@/components/deviceQuickActions';
import { isGlassEnabled, getBottomPadding, isIos } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { DeviceSendBar } from '@/components/deviceSendBar';

function printDeviceInfo(info: DeviceInfo | null) {
  if (!info) return 'No Device Info';
  return `${info.os} ${info.osFlavour} • ${info.formFactor}`;
}

function DeviceInfoSection({ peerInfo, size = 150 }: { peerInfo: PeerInfo | null; size?: number }) {
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
      <UIText style={{ marginTop: 10, textAlign: 'center' }} type="subtitle" color="accentText" font="medium">
        {info?.deviceName || modules.config.DEVICE_NAME}
      </UIText>
      <UIText style={{ textAlign: 'center', padding: 1 }} size="md" color="textSecondary" font="medium">
        {printDeviceInfo(info?.deviceInfo || null)}
      </UIText>
    </>
  );
}

export default function DeviceScreen() {
  const { fingerprint } = useLocalSearchParams<{ fingerprint: string }>();
  const insets = useSafeAreaInsets();
  const bottomPadding = getBottomPadding(insets.bottom);
  const headerHeight = useHeaderHeight();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isWide = screenWidth >= 768 && screenWidth > screenHeight;

  const { peers } = useAppState();

  const isLocal = fingerprint === 'local';
  const deviceFingerprint = isLocal ? null : fingerprint;

  const peerInfo: PeerInfo | null = useMemo(() => {
    if (isLocal) return null;
    return peers.find((p) => p.fingerprint === fingerprint) || null;
  }, [isLocal, fingerprint, peers]);

  const deviceName = useMemo(() => {
    if (peerInfo) return peerInfo.deviceName;
    return 'This Device';
  }, [peerInfo]);

  return (
    <>
    <UIScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: bottomPadding + (peerInfo ? 80 : 0) }}>
      <Stack.Screen
        options={{
          title: deviceName,
          headerTitle: deviceName,
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: isGlassEnabled,
        }}
      />
      {isGlassEnabled && <View style={{ height: headerHeight }} />}
      <View style={[styles.container]}>
        {isWide ? (
          <View style={styles.landscapeGrid}>
            <View style={styles.landscapeDeviceSection}>
              <DeviceInfoSection peerInfo={peerInfo} />
            </View>
            <View style={styles.landscapeActionsSection}>
              <DeviceQuickActions peerInfo={peerInfo} fingerprint={deviceFingerprint} />
            </View>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <DeviceInfoSection peerInfo={peerInfo} />
            </View>
            <DeviceQuickActions peerInfo={peerInfo} fingerprint={deviceFingerprint} />
          </>
        )}
      </View>
    </UIScrollView>
    {peerInfo && (
      <KeyboardAvoidingView
        behavior="position"
        style={[styles.bottomFloatingBar, { bottom: insets.bottom + (isIos ? 0 : 10) }]}
      >
        <DeviceSendBar peerInfo={peerInfo} />
      </KeyboardAvoidingView>
    )}
    </>
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
  bottomFloatingBar: {
    position: 'absolute',
    backgroundColor: 'transparent',
    padding: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
});
