import { UIView } from '@/components/ui/UIView';
import { useAppState } from '@/hooks/useAppState';
import { useRouter, useNavigation } from 'expo-router';
import { View } from 'react-native';
import { FolderFilesGrid } from '@/components/filesGrid';
import { ParamListBase, RouteProp, useRoute } from '@react-navigation/native';
import { extractFolderParamsFromRoute, extractNameFromPath, FolderRouteParams } from '@/lib/fileUtils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { FileRemoteItem } from '@/lib/types';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';

type Props = RouteProp<ParamListBase, string> & {
  params: FolderRouteParams;
};

export default function FolderScreen() {
  const { selectedFingerprint } = useAppState();
  const navigation = useNavigation();
  const router = useRouter();
  const route = useRoute<Props>();
  const headerHeight = useHeaderHeight();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileRemoteItem[]>([]);

  const { path, fingerprint } = useMemo(() => extractFolderParamsFromRoute(route || { params: { path: '', fingerprint: null } }), [route]);

  useEffect(() => {
    // If fingerprint missmatch, go back to first screen
    if (!!route && fingerprint !== selectedFingerprint) {
      router.dismissAll();
    }
  }, [path, fingerprint, selectedFingerprint, router, route]);

  const folderName = useMemo(() => !!route ? extractNameFromPath(path) : 'Folder', [path, route]);

  const handleSelectFile = useCallback((file: FileRemoteItem) => {
    setSelectedFiles((prevSelected) => {
      const isAlreadySelected = prevSelected.some((p) => p.path === file.path);
      if (isAlreadySelected) {
        return prevSelected;
      }
      return [...prevSelected, file];
    });
  }, []);

  const handleDeselectFile = useCallback((file: FileRemoteItem) => {
    setSelectedFiles((prevSelected) =>
      prevSelected.filter((p) => p.path !== file.path)
    );
  }, []);

  useEffect(() => {
    navigation.setOptions({
      title: folderName,
      headerTitle: selectMode ? `${selectedFiles.length} selected` : folderName,
      headerTransparent: true,
      headerBackButtonDisplayMode: 'minimal',
      headerRight: () => {
        if (!selectMode) {
          return <UIHeaderButton name="checkmark.circle" onPress={() => { setSelectMode(true) }} />;
        }
        return (<>
          <UIHeaderButton name="square.and.arrow.up" onPress={() => { }} />
          <UIHeaderButton name="trash" onPress={() => { }} />
          <UIHeaderButton onPress={() => setSelectMode(false)} isHighlight={true} name='xmark' />
        </>);
      }
      ,
    });
  }, [navigation, folderName, selectMode, selectedFiles.length]);

  return (
    <UIView style={{ flex: 1 }}>
      {
        !!route && <FolderFilesGrid
          deviceFingerprint={fingerprint}
          path={path}
          selectMode={selectMode}
          onSelect={handleSelectFile}
          onDeselect={handleDeselectFile}
          headerComponent={
            <View style={{ marginTop: headerHeight }} />
          }
          showPageFooter={true}
          pageFooterStyle={{ marginBottom: 80 }}
        />
      }
    </UIView>
  );
}
