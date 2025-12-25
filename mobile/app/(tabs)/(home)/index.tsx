import { Stack, useRouter } from 'expo-router';
import { StyleSheet, ScrollView, Pressable, View } from 'react-native';
import DeviceSelectorRow from '@/components/deviceSelectorRow';
import { UIView } from '@/components/ui/UIView';
import { useHeaderHeight } from '@react-navigation/elements';
import { UIIcon } from '@/components/ui/UIIcon';
import DeviceIcon from '@/components/deviceIcon';
import { useAppState } from '@/hooks/useAppState';
import { UIText } from '@/components/ui/UIText';

export default function HomeScreen() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();

  const { selectedPeer } = useAppState();

  return (
    <UIView style={{ flex: 1 }}>
      <ScrollView style={{ paddingTop: headerHeight }}>
        <Stack.Screen
          options={{
            title: 'Home',
            headerTitle: 'Media Center',
            headerTransparent: true,
            headerRight: () =>
              <UIView>
                <Pressable style={{ padding: 4 }} onPress={() => router.navigate('/settings')}>
                  <UIIcon name="gear" size={28} color="#007AFF" />
                </Pressable>
              </UIView>
            ,
          }}
        />
        <DeviceSelectorRow />
        <UIView style={styles.container}>
          <View style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <DeviceIcon size={200} iconKey={selectedPeer ? selectedPeer.iconKey : null} />
          <UIText style={{ marginTop: 10, fontSize: 18 }}>
            {selectedPeer ? selectedPeer.deviceName : 'This Device'}
          </UIText>
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
