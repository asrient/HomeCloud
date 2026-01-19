import { UIView } from '@/components/ui/UIView';
import { useAppState } from '@/hooks/useAppState';
import { useRouter, useNavigation } from 'expo-router';
import { Alert, View } from 'react-native';
import { FileQuickActionType, FilesGrid, FileSortBy } from '@/components/filesGrid';
import { ParamListBase, RouteProp, useRoute } from '@react-navigation/native';
import { extractFolderParamsFromRoute, extractNameFromPath, FolderRouteParams, getKind } from '@/lib/fileUtils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { FileRemoteItem } from '@/lib/types';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import { UIContextMenu } from '@/components/ui/UIContextMenu';
import { useInputPopup } from '@/hooks/usePopup';
import { getLocalServiceController, getServiceController, isIos } from '@/lib/utils';
import { UIText } from '@/components/ui/UIText';
import { useFolder } from '@/hooks/useFolders';
import { RemoteItem } from 'shared/types';
import { LoadingModal } from '@/components/LoadingModal';
import { FilePickerModal } from '@/components/FilePickerModal';

type Props = RouteProp<ParamListBase, string> & {
  params: FolderRouteParams;
};

export default function FolderScreen() {
  const { selectedFingerprint, filesViewMode, setFilesViewMode } = useAppState();
  const navigation = useNavigation();
  const router = useRouter();
  const route = useRoute<Props>();
  const headerHeight = useHeaderHeight();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileRemoteItem[]>([]);
  const { openInputPopup } = useInputPopup();
  const [itemsToMove, setItemsToMove] = useState<FileRemoteItem[] | null>(null);

  const [sortBy, setSortBy] = useState<FileSortBy | null>(null);

  const { path, fingerprint } = useMemo(() => extractFolderParamsFromRoute(route || { params: { path: '', fingerprint: null } }), [route]);

  useEffect(() => {
    // If fingerprint missmatch, go back to first screen
    if (!!route && fingerprint !== selectedFingerprint) {
      router.dismissAll();
    }
  }, [path, fingerprint, selectedFingerprint, router, route]);

  const folderName = useMemo(() => !!route ? extractNameFromPath(path) : 'Folder', [path, route]);


  const mapper = useCallback((item: RemoteItem): FileRemoteItem => ({
    ...item,
    isSelected: false,
    deviceFingerprint: fingerprint,
  }), [fingerprint]);

  const { remoteItems, isLoading, error, setRemoteItems } = useFolder<FileRemoteItem>(fingerprint, path, mapper);

  const [currentOperation, setCurrentOperation] = useState<string | null>(null);

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

  const updatedSortBy = useCallback((buttonName: string) => {
    if (buttonName.startsWith('Direction: ')) {
      setSortBy((prev) => ({
        field: prev?.field || 'name',
        direction: buttonName.endsWith('asc') ? 'desc' : 'asc',
      }));
    } else if (buttonName === 'Name') {
      setSortBy((prev) => ({
        field: 'name',
        direction: prev?.direction || 'asc',
      }));
    } else if (buttonName === 'Date Added') {
      setSortBy((prev) => ({
        field: 'dateAdded',
        direction: prev?.direction || 'asc',
      }));
    } else if (buttonName === 'Size') {
      setSortBy((prev) => ({
        field: 'size',
        direction: prev?.direction || 'asc',
      }));
    }
  }, []);

  const newFolder = useCallback(() => {
    openInputPopup({
      title: 'New Folder',
      description: 'Enter the name for the new folder',
      placeholder: 'Folder Name',
      defaultValue: '',
      submitButtonText: 'Create',
      onDone: async (value) => {
        if (value) {
          console.log('Create new folder:', value);
          try {
            const sc = await getServiceController(fingerprint);
            const folder = await sc.files.fs.mkDir(value, path);
            console.log('New folder created:', folder);
            setRemoteItems((prevItems) => [...prevItems, {
              ...folder,
              isSelected: false,
              deviceFingerprint: fingerprint,
            }]);
          } catch (error) {
            console.error('Failed to create folder:', error);
            Alert.alert('Error', 'Failed to create folder. Please try again.');
          }
        }
      },
    });
  }, [fingerprint, openInputPopup, path, setRemoteItems]);

  const deleteItems = useCallback(async (items: FileRemoteItem[]) => {
    return new Promise<boolean>((resolve, reject) => {
      Alert.alert(
        'Delete Items',
        `Are you sure you want to delete ${items.length} item(s)? This action cannot be undone.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => { resolve(false); },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                setCurrentOperation(`Deleting ${items.length} item(s).`);
                const sc = await getServiceController(fingerprint);
                const deleted = await sc.files.fs.unlinkMultiple(items.map(i => i.path));
                setRemoteItems((prevItems) =>
                  prevItems.filter((item) => !deleted.some((p) => p === item.path))
                );
                resolve(true);
              } catch (error) {
                console.error('Failed to delete items:', error);
                Alert.alert('Error', 'Failed to delete items. Please try again.');
                reject(error);
              }
              finally {
                setCurrentOperation(null);
              }
            },
          },
        ]
      );
    });
  }, [fingerprint, setRemoteItems]);

  const renameItem = useCallback((item: FileRemoteItem) => {
    const itemKind = getKind(item);
    openInputPopup({
      title: `Rename ${itemKind}`,
      description: `Enter the new name for the ${itemKind.toLowerCase()}`,
      placeholder: 'Name',
      defaultValue: item.name,
      submitButtonText: 'Rename',
      onDone: async (value) => {
        if (value && value !== item.name) {
          console.log('Rename item:', item.path, 'to', value);
          try {
            setCurrentOperation(`Renaming ${itemKind}.`);
            const sc = await getServiceController(fingerprint);
            const renamedItem = await sc.files.fs.rename(item.path, value);
            console.log('Item renamed:', renamedItem);
            setRemoteItems((prevItems) =>
              prevItems.map((it) =>
                it.path === item.path ? { ...renamedItem, isSelected: false, deviceFingerprint: fingerprint } : it
              )
            );
          } catch (error) {
            console.error('Failed to rename item:', error);
            Alert.alert('Error', 'Failed to rename item. Please try again.');
          } finally {
            setCurrentOperation(null);
          }
        }
      },
    });
  }, [fingerprint, openInputPopup, setRemoteItems]);

  const deleteSelectedItems = useCallback(async () => {
    if (selectedFiles.length === 0) {
      return;
    }
    try {
      const success = await deleteItems(selectedFiles);
      if (success) {
        setSelectedFiles([]);
        setSelectMode(false);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // ignore, error handled in deleteItems
    }
  }, [deleteItems, selectedFiles]);

  const moveItems = useCallback(async (destFingerprint: string | null, destPath: string, deleteSource: boolean) => {
    if (!itemsToMove || itemsToMove.length === 0) {
      return;
    }
    const items = [...itemsToMove];
    setItemsToMove(null);
    const filePaths = items.map(i => i.path);
    try {
      // setCurrentOperation(`Moving ${items.length} item(s).`);
      const serviceController = await getServiceController(destFingerprint);
      const res = await serviceController.files.move(destFingerprint, destPath, filePaths, deleteSource);
      console.log('Items moved:', res);
      // Remove moved items from current list
      if (deleteSource) {
        setRemoteItems((prevItems) =>
          prevItems.filter((item) => !items.some((i) => i.path === item.path))
        );
      }
    }
    catch (error) {
      console.error('Failed to move items:', error);
      Alert.alert('Error', 'Failed to move items. Please try again.');
    } finally {
      // setCurrentOperation(null);
    }
  }, [setRemoteItems, itemsToMove]);

  const shareItem = useCallback(async (item: FileRemoteItem) => {
    try {
      //setCurrentOperation('Preparing..');
      const localSc = getLocalServiceController();
      await localSc.files.shareFiles(item.deviceFingerprint || null, [item.path]);
    }
    catch (error) {
      console.error('Failed to share item:', error);
      Alert.alert('Error', 'Failed to share item. Please try again.');
    } finally {
      //setCurrentOperation(null);
    }
  }, []);

  useEffect(() => {
    navigation.setOptions({
      title: folderName,
      headerTitle: selectMode ? `${selectedFiles.length} selected` : folderName,
      headerTransparent: isIos,
      headerBackButtonDisplayMode: 'minimal',
      headerRight: () => {
        if (!selectMode) {
          return <>
            <UIHeaderButton name="checkmark.circle" onPress={() => { setSelectMode(true) }} />
            <UIContextMenu
              dropdownMenuMode
              actions={[
                {
                  id: 'newFolder',
                  title: "New Folder",
                  icon: "folder.badge.plus",
                },
                {
                  id: 'sort',
                  title: "Sort",
                  icon: "arrow.up.arrow.down",
                  actions: [
                    { id: 'toggleDirection', title: `Direction: ${sortBy?.direction || 'asc'}`, icon: "arrow.up.arrow.down.circle" },
                    { id: 'sortByName', title: "Name", icon: "textformat", selected: sortBy?.field === 'name' },
                    { id: 'sortByDate', title: "Date Added", icon: "calendar", selected: sortBy?.field === 'dateAdded' },
                    { id: 'sortBySize', title: "Size", icon: "arrow.up.arrow.down.circle", selected: sortBy?.field === 'size' },
                  ]
                },
                {
                  id: 'display',
                  title: "Display", icon: "rectangle.grid.2x2",
                  inlineChildren: true,
                  actions: [
                    { id: 'viewGrid', title: "Grid", icon: "square.grid.2x2", selected: filesViewMode === 'grid' },
                    { id: 'viewList', title: "List", icon: "list.bullet", selected: filesViewMode === 'list' },
                  ]
                },
              ]}
              onAction={(id) => {
                console.log("Folder context menu action pressed", id);
                if (id === 'viewGrid') {
                  setFilesViewMode('grid');
                } else if (id === 'viewList') {
                  setFilesViewMode('list');
                } else if (id === 'toggleDirection') {
                  updatedSortBy(`Direction: ${sortBy?.direction || 'asc'}`);
                } else if (id === 'sortByName') {
                  updatedSortBy('Name');
                } else if (id === 'sortByDate') {
                  updatedSortBy('Date Added');
                } else if (id === 'sortBySize') {
                  updatedSortBy('Size');
                } else if (id === 'newFolder') {
                  newFolder();
                }
              }}
            >
              <UIHeaderButton name='ellipsis.circle' />
            </UIContextMenu>
          </>;
        }
        return (<>
          <UIHeaderButton name="arrow.up.message" onPress={() => setItemsToMove(selectedFiles)} />
          <UIHeaderButton name="trash" onPress={deleteSelectedItems} />
          <UIHeaderButton onPress={() => setSelectMode(false)} isHighlight={true} name='xmark' />
        </>);
      }
      ,
    });
  }, [navigation, folderName, selectMode, selectedFiles.length, filesViewMode, setFilesViewMode, sortBy, updatedSortBy, newFolder, deleteSelectedItems, selectedFiles]);

  const sendToDevice = useCallback(async (items: FileRemoteItem[], destFingerprint: string | null) => {
    try {
      setCurrentOperation(`Sending ${items.length} item(s) to device.`);
      const sc = await getServiceController(destFingerprint);
      for (const item of items) {
        await sc.files.download(item.deviceFingerprint || modules.config.FINGERPRINT, item.path);
      }
    }
    catch (error) {
      console.error('Failed to send items to device:', error);
      Alert.alert('Error', 'Failed to send items to device. Please try again.');
    } finally {
      setCurrentOperation(null);
    }
  }, []);

  const openInDevice = useCallback(async (item: FileRemoteItem, destFingerprint: string) => {
    try {
      console.log('Opening item in device:', item.path);
      setCurrentOperation('Opening item in device.');
      const sc = await getServiceController(destFingerprint);
      await sc.files.openFile(item.deviceFingerprint || modules.config.FINGERPRINT, item.path);
    }
    catch (error) {
      console.error('Failed to open item in device:', error);
      Alert.alert('Error', 'Failed to open item in device. Please try again.');
    } finally {
      setCurrentOperation(null);
    }
  }, []);

  const handleQuickAction = useCallback((action: FileQuickActionType) => {
    // console.log('Quick action triggered:', action);
    switch (action.type) {
      case 'delete':
        deleteItems([action.item]);
        break;
      case 'move':
        // Open move screen
        setItemsToMove([action.item]);
        break;
      case 'rename':
        renameItem(action.item);
        break;
      case 'info':
        Alert.alert('File Info', `Path: ${action.item.path}\nSize: ${action.item.size} bytes`);
        break;
      case 'openInDevice':
        if (action.targetDeviceFingerprint !== undefined) {
          openInDevice(action.item, action.targetDeviceFingerprint);
        }
        break;
      case 'export':
        // Export file
        shareItem(action.item);
        break;
      case 'sendToDevice':
        if (action.targetDeviceFingerprint !== undefined) {
          sendToDevice([action.item], action.targetDeviceFingerprint);
        }
        break;
      default:
        console.warn('Unknown quick action:', action);
    }
  }, [deleteItems, openInDevice, renameItem, sendToDevice, shareItem]);

  return (
    <UIView style={{ flex: 1 }}>
      {
        !!route &&
        <FilesGrid
          items={remoteItems}
          isLoading={isLoading}
          error={error}
          footerComponent={

            <View style={{ paddingHorizontal: 10, paddingVertical: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 80 }}>
              <UIText size="sm" color='textSecondary'>
                {`${remoteItems.length} items.`}
              </UIText>
            </View>
          }
          selectMode={selectMode}
          onSelect={handleSelectFile}
          onDeselect={handleDeselectFile}
          viewMode={filesViewMode}
          sortBy={sortBy || undefined}
          onQuickAction={handleQuickAction}
          headerComponent={
            isIos ?
              <View style={{ marginTop: headerHeight }} />
              : undefined
          }
        />

      }
      <LoadingModal isActive={!!currentOperation} title={currentOperation || undefined} />
      <FilePickerModal
        isOpen={!!itemsToMove}
        pickerType="folder"
        onDone={async (items) => {
          if (!items || items.length === 0) {
            setItemsToMove(null);
            return;
          }
          // Move selected files to the chosen folder
          console.log('Moving items to folder:', items);
          await moveItems(items[0].deviceFingerprint, items[0].path, true);
        }}
      />
    </UIView>
  );
}
