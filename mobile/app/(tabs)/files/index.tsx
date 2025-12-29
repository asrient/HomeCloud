import DeviceSelectorRow from '@/components/deviceSelectorRow';
import { useAppState } from '@/hooks/useAppState';
import { Stack } from 'expo-router';
import { View, } from 'react-native';
import { FolderFilesGrid, PinnedFoldersGrid } from '@/components/filesGrid';
import { UIText } from '@/components/ui/UIText';
import { UIScrollView } from '@/components/ui/UIScrollView';

export default function FilesScreen() {
  const { selectedFingerprint } = useAppState();

  return (
    <UIScrollView style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: 'Files',
          headerTitle: 'Files',
          headerLargeTitle: true,
          headerTransparent: true,
        }}
      />
      <DeviceSelectorRow />
      <View style={{ flex: 1, marginTop: 10 }}>
        <PinnedFoldersGrid
          hideEmpty={true}
          headerComponent={
            <View style={{ padding: 10 }}>
              <UIText type='subtitle'>Pinned Folders</UIText>
            </View>
          }
          deviceFingerprint={selectedFingerprint}
        />
      </View>
      <View style={{ flex: 1, marginTop: 10 }}>
        <FolderFilesGrid
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
