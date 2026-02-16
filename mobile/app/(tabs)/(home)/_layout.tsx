import { DeviceSendBar } from '@/components/deviceSendBar';
import { useAppState } from '@/hooks/useAppState';
import { Stack } from 'expo-router';
import { View, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabBarHeight, isIos } from '@/lib/utils';

export default function Layout() {
  const { selectedPeer } = useAppState();
  const insets = useSafeAreaInsets();
  const tabBarHeight = getTabBarHeight(insets.bottom);
  const sendBarBottom = tabBarHeight + (isIos ? 10 : 20);

  return <View style={{ flex: 1 }}>
    <Stack />
    {
      selectedPeer && (
        <KeyboardAvoidingView  
        behavior='position'
        style={[styles.bottomFloatingBar, { bottom: sendBarBottom }]}>
          <DeviceSendBar peerInfo={selectedPeer} />
        </KeyboardAvoidingView>
      )
    }
  </View>;
}

const styles = StyleSheet.create({
  bottomFloatingBar: {
    position: 'absolute',
    left: 0,
    right: 0,
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
