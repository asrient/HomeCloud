
import { StyleSheet, View, Image, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { UIScrollView } from '@/components/ui/UIScrollView';
import { UIText } from '@/components/ui/UIText';
import { UIIcon } from '@/components/ui/UIIcon';
import { Section, Line, LineLink, FormContainer } from '@/components/ui/UIFormPrimatives';
import { useEffect, useState } from 'react';
import { DeviceInfo, PeerInfo } from 'shared/types';
import { useAccountState } from '@/hooks/useAccountState';
import { useAppState } from '@/hooks/useAppState';
import { useAlert } from '@/hooks/useAlert';
import { getAppName, getOSIconUrl, isIos } from '@/lib/utils';
import DeviceIcon from '@/components/deviceIcon';

export default function SettingsScreen() {
  const router = useRouter();
  const { showAlert } = useAlert();
  const headerHeight = useHeaderHeight();

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const { isLinked, accountEmail } = useAccountState();
  const { peers } = useAppState();

  useEffect(() => {
    const fetchDeviceInfo = async () => {
      const info = await modules.getLocalServiceController().system.getDeviceInfo();
      setDeviceInfo(info);
    };
    fetchDeviceInfo();
  }, []);

  const openLogin = () => {
    router.navigate('/login');
  };

  const handleRemovePeer = (peer: PeerInfo) => {
    showAlert(
      'Remove Device',
      `Are you sure you want to remove "${peer.deviceName}" from your account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const localSc = modules.getLocalServiceController();
            await localSc.account.removePeer(peer.fingerprint);
          },
        },
      ]
    );
  };

  const handleUnlink = () => {
    showAlert(
      'Unlink Device',
      'Are you sure you want to unlink this device from your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            const localSc = modules.getLocalServiceController();
            await localSc.account.removePeer(null);
          },
        },
      ]
    );
  };

  return (
    <UIScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerTitle: 'Settings',
          headerLargeTitle: true,
          headerTransparent: isIos,
        }}
      />
      {isIos && <View style={{ height: headerHeight }} />}
      <FormContainer>
        <Section title="About">
          <Line title="Version" value={modules.config.VERSION} />
          <Line title="Device Info">
            {deviceInfo && (
              <View style={styles.deviceInfoRow}>
                <Image
                  source={getOSIconUrl(deviceInfo)}
                  style={styles.osIcon}
                />
                <UIText size="md" color="textSecondary">
                  {`${deviceInfo.os} ${deviceInfo.osFlavour} (${deviceInfo.formFactor})`}
                </UIText>
              </View>
            )}
          </Line>
        </Section>

        <Section title="Account">
          {!isLinked && (
            <LineLink text="Login to account..." onPress={openLogin} color="primary" />
          )}
          {isLinked && (
            <>
              <Line title="Email" value={accountEmail || ''} />
              <LineLink text="Unlink device..." onPress={handleUnlink} color="destructive" />
            </>
          )}
        </Section>

        {isLinked && peers.length > 0 && (
          <Section title="Linked Devices">
            {peers.map((peer) => (
              <Line key={peer.fingerprint}>
                <View style={styles.peerRow}>
                  <DeviceIcon size={32} iconKey={peer.iconKey} />
                  <View style={styles.peerInfo}>
                    <UIText size="md" color="text" numberOfLines={1}>
                      {peer.deviceName}
                    </UIText>
                    <UIText size="xs" color="textSecondary" numberOfLines={1}>
                      {peer.deviceInfo ? `${peer.deviceInfo.os} ${peer.deviceInfo.osFlavour}` : peer.version}
                    </UIText>
                  </View>
                  <Pressable
                    onPress={() => handleRemovePeer(peer)}
                    hitSlop={8}
                    style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
                  >
                    <UIIcon name="trash" size={20} color="#FF3B30" />
                  </Pressable>
                </View>
              </Line>
            ))}
          </Section>
        )}

        <View style={styles.footer}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.appIcon}
          />
          <UIText size="sm" color="textSecondary" style={styles.footerText}>
            {getAppName()}. Asrient&apos;s Studio, 2025.
          </UIText>
        </View>
      </FormContainer>
    </UIScrollView>
  );
}

const styles = StyleSheet.create({
  deviceInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  osIcon: {
    width: 20,
    height: 20,
    marginRight: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 20,
  },
  appIcon: {
    width: 25,
    height: 25,
    marginRight: 8,
  },
  footerText: {
    textAlign: 'center',
  },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  peerInfo: {
    marginLeft: 12,
    flex: 1,
  },
});
