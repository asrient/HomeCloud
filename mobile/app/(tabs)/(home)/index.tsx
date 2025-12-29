import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import DeviceSelectorRow from '@/components/deviceSelectorRow';
import { UIView } from '@/components/ui/UIView';
import { UIIcon } from '@/components/ui/UIIcon';
import DeviceIcon from '@/components/deviceIcon';
import { useAppState } from '@/hooks/useAppState';
import { UIText } from '@/components/ui/UIText';
import { ConnectionType } from '@/lib/types';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import { UIScrollView } from '@/components/ui/UIScrollView';

export default function HomeScreen() {
  const router = useRouter();

  const { selectedPeer, selectedPeerConnection } = useAppState();

  return (
    <UIScrollView>
      <Stack.Screen
        options={{
          title: 'Home',
          headerTitle: 'Media Center',
          headerLargeTitle: true,
          headerTransparent: true,
          headerRight: () =>
            <View>
              <UIHeaderButton name="gear" onPress={() => router.navigate('/settings')} />
            </View>
          ,
        }}
      />
      <UIView style={{ flex: 1 }}>
        <DeviceSelectorRow />
        <View style={styles.container}>
          <View style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <DeviceIcon size={200} iconKey={selectedPeer ? selectedPeer.iconKey : null} />
            <UIText style={{ marginTop: 10, fontSize: 20, fontWeight: '600', textAlign: 'center' }}>
              {selectedPeer ? selectedPeer.deviceName : 'This Device'}
            </UIText>
            {
              !!selectedPeer &&
              <View style={{ alignItems: 'center', marginTop: 2, flexDirection: 'row', justifyContent: 'center' }}>
                {
                  selectedPeerConnection &&
                  <UIIcon name={selectedPeerConnection.connectionType === ConnectionType.LOCAL ? "wifi" : "cellularbars"} size={16} color="green" style={{ marginRight: 4 }} />
                }
                <UIText style={{ fontSize: 16, color: selectedPeerConnection ? 'green' : 'grey' }}>
                  {selectedPeerConnection ? 'Online' : 'Offline'}
                </UIText>
              </View>
            }
          </View>
        </View>
      </UIView>
    </UIScrollView>

  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
});
