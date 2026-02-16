import DeviceSelectorRow from '@/components/deviceSelectorRow';
import { useAppState } from '@/hooks/useAppState';
import { Stack } from 'expo-router';
import { View, } from 'react-native';
import { FolderFilesGrid, PinnedFoldersGrid } from '@/components/filesGrid';
import { UIText } from '@/components/ui/UIText';
import { UIScrollView } from '@/components/ui/UIScrollView';
import { isGlassEnabled, getBottomPadding } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function FilesScreen() {
  const { selectedFingerprint } = useAppState();
  const insets = useSafeAreaInsets();
  const bottomPadding = getBottomPadding(insets.bottom);

  return (
    <UIScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: bottomPadding }}>
      <Stack.Screen
        options={{
          title: 'Files',
          headerTitle: 'Files',
          headerLargeTitle: true,
          headerTransparent: isGlassEnabled,
        }}
      />
      <DeviceSelectorRow />
      <View style={{ flex: 1, marginTop: 10 }}>
        <PinnedFoldersGrid
          hideEmpty={true}
          disableContextMenu={true}
          headerComponent={
            <View style={{ padding: 10 }}>
              <UIText type='subtitle'>Favorites</UIText>
            </View>
          }
          deviceFingerprint={selectedFingerprint}
        />
      </View>
      <View style={{ flex: 1, marginTop: 10 }}>
        <FolderFilesGrid
          disableContextMenu={true}
          headerComponent={
            <View style={{ padding: 10 }}>
              <UIText type='subtitle'>Disks</UIText>
            </View>
          }
          deviceFingerprint={selectedFingerprint}
          path=''
        />
      </View>
    </UIScrollView>
  );
}
