import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View, ScrollView, useWindowDimensions } from 'react-native';
import DeviceIcon from '@/components/deviceIcon';
import { useAppState } from '@/hooks/useAppState';
import { UIText } from '@/components/ui/UIText';
import { useAutoConnect } from '@/hooks/useAutoConnect';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { DeviceInfo, PeerInfo } from 'shared/types';
import { DeviceQuickActions } from '@/components/deviceQuickActions';
import { useThemeColor } from '@/hooks/useThemeColor';

function printDeviceInfo(info: DeviceInfo | null) {
  if (!info) return 'No Device Info';
  return `${info.os} ${info.osFlavour} • ${info.formFactor}`;
}

function DeviceInfoSection({ peerInfo, size = 80 }: { peerInfo: PeerInfo | null; size?: number }) {
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
      <UIText style={{ marginTop: 6, textAlign: 'center' }} size="lg" color="accentText" font="medium">
        {info?.deviceName || modules.config.DEVICE_NAME}
      </UIText>
      <UIText style={{ textAlign: 'center' }} size="sm" color="textSecondary" font="medium">
        {printDeviceInfo(info?.deviceInfo || null)}
      </UIText>
    </>
  );
}

export default function DeviceSheetScreen() {
  const { fingerprint } = useLocalSearchParams<{ fingerprint: string }>();
  const router = useRouter();
  const backgroundColor = useThemeColor({}, 'backgroundSecondary');
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isWide = screenWidth >= 768 && screenWidth > screenHeight;

  const { peers } = useAppState();

  const isLocal = !fingerprint || fingerprint === 'local';
  const deviceFingerprint = isLocal ? null : fingerprint;

  // Auto-connect to remote device while this screen is mounted
  useAutoConnect(deviceFingerprint, 'device-sheet');

  const peerInfo: PeerInfo | null = useMemo(() => {
    if (isLocal) return null;
    return peers.find((p) => p.fingerprint === fingerprint) || null;
  }, [isLocal, fingerprint, peers]);

  const routeFingerprint = fingerprint || 'local';

  const handleNavigate = useCallback((subPath: string) => {
    router.back();
    setTimeout(() => {
      router.push(`/device/${routeFingerprint}/${subPath}` as any);
    }, 300);
  }, [router, routeFingerprint]);

  return (
    <ScrollView
      style={{ backgroundColor }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, paddingTop: 16, paddingBottom: 20 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.container}>
        {isWide ? (
          <View style={styles.landscapeGrid}>
            <View style={styles.landscapeDeviceSection}>
              <DeviceInfoSection peerInfo={peerInfo} />
            </View>
            <View style={styles.landscapeActionsSection}>
              <DeviceQuickActions
                peerInfo={peerInfo}
                fingerprint={deviceFingerprint}
                onNavigate={handleNavigate}
              />
            </View>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', justifyContent: 'center', padding: 10 }}>
              <DeviceInfoSection peerInfo={peerInfo} />
            </View>
            <DeviceQuickActions
              peerInfo={peerInfo}
              fingerprint={deviceFingerprint}
              onNavigate={handleNavigate}
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
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
