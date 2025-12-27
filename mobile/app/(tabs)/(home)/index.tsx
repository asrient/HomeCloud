import { Stack, useRouter } from 'expo-router';
import { StyleSheet, ScrollView, View } from 'react-native';
import DeviceSelectorRow from '@/components/deviceSelectorRow';
import { UIView } from '@/components/ui/UIView';
import { useHeaderHeight } from '@react-navigation/elements';
import { UIIcon } from '@/components/ui/UIIcon';
import DeviceIcon from '@/components/deviceIcon';
import { useAppState } from '@/hooks/useAppState';
import { UIText } from '@/components/ui/UIText';
import { ConnectionType } from '@/lib/types';
import { HeaderButton } from '@/components/ui/HeaderButton';

export default function HomeScreen() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();

  const { selectedPeer, selectedPeerConnection } = useAppState();

  return (
    <UIView style={{ flex: 1 }}>
      <ScrollView style={{ paddingTop: headerHeight }}>
        <Stack.Screen
          options={{
            title: 'Home',
            headerTitle: 'Media Center',
            headerTransparent: true,
            headerRight: () =>
              <View>
                <HeaderButton name="gear" onPress={() => router.navigate('/settings')} />
              </View>
            ,
          }}
        />
        <DeviceSelectorRow />
        <UIView style={styles.container}>
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
        </UIView>
      </ScrollView>
    </UIView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
});
