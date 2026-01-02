import { DeviceSendBar } from '@/components/deviceSendBar';
import { useAppState } from '@/hooks/useAppState';
import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';

export default function Layout() {
  const { selectedPeer } = useAppState();

  return <View style={{ flex: 1 }}>
    <Stack />
    {
      selectedPeer && (
        <View style={styles.bottomFloatingBar}>
          <DeviceSendBar peerInfo={selectedPeer} />
        </View>
      )
    }
  </View>;
}

const styles = StyleSheet.create({
  bottomFloatingBar: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    padding: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
