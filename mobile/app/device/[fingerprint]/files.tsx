import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { FolderFilesGrid, PinnedFoldersGrid } from '@/components/filesGrid';
import { UIText } from '@/components/ui/UIText';
import { UIScrollView } from '@/components/ui/UIScrollView';
import { isGlassEnabled, getBottomPadding } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';

export default function DeviceFilesScreen() {
  const { fingerprint } = useLocalSearchParams<{ fingerprint: string }>();
  const insets = useSafeAreaInsets();
  const bottomPadding = getBottomPadding(insets.bottom);
  const headerHeight = useHeaderHeight();

  const deviceFingerprint = fingerprint === 'local' ? null : fingerprint;

  return (
    <UIScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: bottomPadding + 80 }}>
      <Stack.Screen
        options={{
          title: 'Files',
          headerTitle: 'Files',
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: isGlassEnabled,
        }}
      />
      {isGlassEnabled && <View style={{ height: headerHeight }} />}
      <View style={{ flex: 1, marginTop: 10 }}>
        <PinnedFoldersGrid
          hideEmpty={true}
          disableContextMenu={true}
          headerComponent={
            <View style={{ padding: 10 }}>
              <UIText type="subtitle">Favorites</UIText>
            </View>
          }
          deviceFingerprint={deviceFingerprint}
        />
      </View>
      <View style={{ flex: 1, marginTop: 10 }}>
        <FolderFilesGrid
          disableContextMenu={true}
          headerComponent={
            <View style={{ padding: 10 }}>
              <UIText type="subtitle">Disks</UIText>
            </View>
          }
          deviceFingerprint={deviceFingerprint}
          path=""
        />
      </View>
    </UIScrollView>
  );
}
