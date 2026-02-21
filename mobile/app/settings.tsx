
import { StyleSheet, View, Image, Pressable, Platform, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { UIScrollView } from '@/components/ui/UIScrollView';
import { UIText } from '@/components/ui/UIText';
import { UIIcon } from '@/components/ui/UIIcon';
import { Section, Line, LineLink, FormContainer } from '@/components/ui/UIFormPrimatives';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConnectionType, DeviceInfo, PeerInfo } from 'shared/types';
import { useAccountState } from '@/hooks/useAccountState';
import { useAppState } from '@/hooks/useAppState';
import { useAlert } from '@/hooks/useAlert';
import { useManagedLoading } from '@/hooks/useManagedLoading';
import { getAppName, getOSIconUrl, isGlassEnabled, isIos, getBottomPadding } from '@/lib/utils';
import DeviceIcon from '@/components/deviceIcon';
import { HelpLinkType } from 'shared/helpLinks';
import { hasStorageAccess, requestStorageAccess } from '@/lib/permissions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/useThemeColor';
import InstallLinkModal from '@/components/InstallLinkModal';
import { LoadingModal } from '@/components/LoadingModal';

export default function SettingsScreen() {
  const router = useRouter();
  const { showAlert } = useAlert();
  const { withLoading } = useManagedLoading();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const bottomPadding = getBottomPadding(insets.bottom);

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [storageGranted, setStorageGranted] = useState(true);
  const [ifaceStatuses, setIfaceStatuses] = useState<{ type: ConnectionType; enabled: boolean }[]>([]);
  const { isLinked, accountEmail } = useAccountState();
  const { peers, setOnboarded } = useAppState();
  const highlightColor = useThemeColor({}, 'highlight');
  const [installLinkOpen, setInstallLinkOpen] = useState(false);

  const isDev = useMemo(() => {
    return modules.config.IS_DEV;
  }, []);

  const showPermissionsSection = useMemo(() => {
    return !storageGranted;
  }, [storageGranted]);

  useEffect(() => {
    const fetchDeviceInfo = async () => {
      const info = await modules.getLocalServiceController().system.getDeviceInfo();
      setDeviceInfo(info);
    };
    fetchDeviceInfo();
    if (Platform.OS === 'android') {
      hasStorageAccess().then(setStorageGranted);
    }
    const localSc = modules.getLocalServiceController();
    setIfaceStatuses(localSc.net.getConnectionInterfaceStatuses());
  }, []);

  const handleGrantStorage = useCallback(async () => {
    const granted = await requestStorageAccess();
    setStorageGranted(granted);
  }, []);

  const connectionInterfaceLabels: Record<string, string> = {
    [ConnectionType.LOCAL]: 'Local Network',
    [ConnectionType.WEB]: 'Web Connect',
  };

  const handleToggleInterface = useCallback(async (type: ConnectionType, enabled: boolean) => {
    setIfaceStatuses(prev => prev.map(s => s.type === type ? { ...s, enabled } : s));
    const localSc = modules.getLocalServiceController();
    await localSc.net.setConnectionInterfaceEnabled(type, enabled);
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

  const openLink = (type: HelpLinkType) => {
    const localSc = modules.getLocalServiceController();
    localSc.app.openHelpLink(type).catch((err) => {
      console.error('Failed to open help link:', err);
      showAlert('Error', 'Failed to open link.');
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <UIScrollView themeColor={isIos ? 'backgroundSecondary' : 'background'} showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: bottomPadding }}>
      {isGlassEnabled && <View style={{ height: headerHeight }} />}
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

        {showPermissionsSection && (
          <Section title="Permissions">
            {
              !storageGranted && (
                <LineLink
                  text="Grant Storage Access"
                  onPress={handleGrantStorage}
                  color="primary"
                />
              )
            }
          </Section>
        )}

        {ifaceStatuses.length > 0 && (
          <Section title="Allowed Connections" footer="At least one connection method must be enabled to connect to other devices.">
            {ifaceStatuses.map(({ type, enabled }) => (
              <Line key={type} title={connectionInterfaceLabels[type] || type}>
                <Switch
                  value={enabled}
                  onValueChange={(value) => handleToggleInterface(type, value)}
                  trackColor={{ true: highlightColor }}
                />
              </Line>
            ))}
          </Section>
        )}

        <Section title="Account">
          {!isLinked && (
            <LineLink text="Login to account" onPress={openLogin} color="primary" />
          )}
          {isLinked && (
            <>
              <Line title="Email" value={accountEmail || ''} />
              <LineLink text="Unlink Device" onPress={handleUnlink} color="destructive" />
            </>
          )}
        </Section>

        {isLinked && (
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
            <LineLink
              text="Add More Devices"
              onPress={() => setInstallLinkOpen(true)}
              color="primary"
            />
          </Section>
        )}

        {isDev && (
          <Section title="Development">
            <LineLink
              text="Reset Onboarding"
              onPress={async () => {
                const localSc = modules.getLocalServiceController();
                await localSc.app.setOnboarded(false);
                setOnboarded(false);
                showAlert('Onboarding flag reset', 'Restart the app to see the welcome screen.');
              }}
              color="destructive"
            />
            <LineLink
              text="Open Login"
              onPress={() => router.navigate('/login')}
            />
            <LineLink
              text="Test Loading Modal"
              onPress={() => {
                withLoading(async (isCancelled) => {
                  await new Promise<void>((resolve) => {
                    const interval = setInterval(() => {
                      if (isCancelled()) {
                        clearInterval(interval);
                        resolve();
                      }
                    }, 100);
                  });
                }, { title: 'Testing loading modal...', canCancel: true });
              }}
            />
          </Section>
        )}

        <Section title="Help">
          <LineLink text="Privacy Policy" onPress={() => openLink('Privacy')} />
          <LineLink text="Website" onPress={() => openLink('Website')} />
        </Section>

        <View style={styles.footer}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.appIcon}
          />
          <UIText size="sm" color="textSecondary" style={styles.footerText}>
            {getAppName()}. Asrient&apos;s Studio, 2026.
          </UIText>
        </View>

      </FormContainer>
      <InstallLinkModal isOpen={installLinkOpen} onClose={() => setInstallLinkOpen(false)} />
    </UIScrollView>
    <LoadingModal />
    </View>
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
