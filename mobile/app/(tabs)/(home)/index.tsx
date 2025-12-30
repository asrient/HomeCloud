import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import DeviceSelectorRow from '@/components/deviceSelectorRow';
import { UIIcon } from '@/components/ui/UIIcon';
import DeviceIcon from '@/components/deviceIcon';
import { useAppState } from '@/hooks/useAppState';
import { UIText } from '@/components/ui/UIText';
import { ConnectionType } from '@/lib/types';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import { UIScrollView } from '@/components/ui/UIScrollView';
import { useHeaderHeight } from '@react-navigation/elements';
import { useMemo } from 'react';

const MAX_DEVICE_NAME_LENGTH = 23;

export default function HomeScreen() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();

  const { selectedPeer, selectedPeerConnection } = useAppState();

  const headerTitle = useMemo(() => {
    const deviceName = selectedPeer ? selectedPeer.deviceName : 'This Device';
    if (headerHeight > 150) {
      return 'Media Center';
    }
    if (deviceName.length > MAX_DEVICE_NAME_LENGTH) {
      return deviceName.substring(0, MAX_DEVICE_NAME_LENGTH - 3) + '...';
    }
    return deviceName;
  }, [headerHeight, selectedPeer]);

  return (
    <UIScrollView style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: 'Home',
          headerTitle,
          headerLargeTitle: true,
          headerTransparent: true,
          headerRight: () =>
            <View>
              <UIHeaderButton name="gear" onPress={() => router.navigate('/settings')} />
            </View>
          ,
        }}
      />
        <DeviceSelectorRow/>
        <View style={styles.container}>
          <View style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <DeviceIcon size={200} iconKey={selectedPeer ? selectedPeer.iconKey : null} />
            <UIText style={{ marginTop: 10, textAlign: 'center' }} type='subtitle'>
              {selectedPeer ? selectedPeer.deviceName : 'This Device'}
            </UIText>
            {
              !!selectedPeer &&
              <View style={{ alignItems: 'center', marginTop: 2, flexDirection: 'row', justifyContent: 'center' }}>
                {
                  selectedPeerConnection &&
                  <UIIcon name={selectedPeerConnection.connectionType === ConnectionType.LOCAL ? "wifi" : "cellularbars"} size={16} color="green" style={{ marginRight: 4 }} />
                }
                <UIText style={{ color: selectedPeerConnection ? 'green' : 'grey' }} size='sm'>
                  {selectedPeerConnection ? 'Online' : 'Offline'}
                </UIText>
              </View>
            }
          </View>
      </View>
    </UIScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
    paddingHorizontal: 20,
  },
});
