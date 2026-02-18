import { useAutoConnect } from '@/hooks/useAutoConnect';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';

export default function DeviceLayout() {
  const { fingerprint } = useLocalSearchParams<{ fingerprint: string }>();

  const isLocal = fingerprint === 'local';
  const deviceFingerprint = isLocal ? null : fingerprint;

  // Auto-connect to remote device
  useAutoConnect(deviceFingerprint, 'device');

  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerLeft: () => (
          <UIHeaderButton name="chevron.left" onPress={() => router.back()} />
        ),
      }}
    />
  );
}
