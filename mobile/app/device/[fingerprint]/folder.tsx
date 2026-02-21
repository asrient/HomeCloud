import { UIView } from '@/components/ui/UIView';
import { useAppState } from '@/hooks/useAppState';
import { useNavigation, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { FileQuickActionType, FilesGrid, FileSortBy } from '@/components/filesGrid';
import { ParamListBase, RouteProp, useRoute } from '@react-navigation/native';
import { extractFolderParamsFromRoute, extractNameFromPath, FolderRouteParams, getKind } from '@/lib/fileUtils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { FileRemoteItem } from '@/lib/types';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import { UIContextMenu } from '@/components/ui/UIContextMenu';
import { useInputPopup } from '@/hooks/usePopup';
import { useAlert } from '@/hooks/useAlert';
import { useManagedLoading } from '@/hooks/useManagedLoading';
import { useSendAssets } from '@/hooks/useSendAssets';
import { getLocalServiceController, getServiceController, isGlassEnabled } from '@/lib/utils';
import { UIText } from '@/components/ui/UIText';
import { useFolder } from '@/hooks/useFolders';
import { RemoteItem } from 'shared/types';
import { FilePickerModal } from '@/components/FilePickerModal';

type Props = RouteProp<ParamListBase, string> & {
  params: FolderRouteParams;
};

export default function FolderScreen() {
  const { fingerprint: routeFingerprint } = useLocalSearchParams<{ fingerprint: string }>();
  const { filesViewMode, setFilesViewMode } = useAppState();
  const navigation = useNavigation();
  const route = useRoute<Props>();
  const headerHeight = useHeaderHeight();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileRemoteItem[]>([]);
  const { openInputPopup } = useInputPopup();
  const { showAlert } = useAlert();
  const { withLoading } = useManagedLoading();
  const { sendAssets } = useSendAssets();
  const [itemsToMove, setItemsToMove] = useState<FileRemoteItem[] | null>(null);

  const [sortBy, setSortBy] = useState<FileSortBy | null>(null);

  const { path, fingerprint: folderFingerprint } = useMemo(() => extractFolderParamsFromRoute(route || { params: { path: '', fingerprint: null } }), [route]);

  // Use the route fingerprint from the URL, falling back to the folder param
  const fingerprint = useMemo(() => {
    if (routeFingerprint === 'local') return null;
    return folderFingerprint || routeFingerprint || null;
  }, [routeFingerprint, folderFingerprint]);

  const folderName = useMemo(() => !!route ? extractNameFromPath(path) : 'Folder', [path, route]);

  const mapper = useCallback((item: RemoteItem): FileRemoteItem => ({
    ...item,
    isSelected: false,
    deviceFingerprint: fingerprint,
  }), [fingerprint]);

  const { remoteItems, isLoading, error, setRemoteItems } = useFolder<FileRemoteItem>(fingerprint, path, mapper);

  useEffect(() => {
    setSelectMode(false);
    setSelectedFiles([]);
  }, [fingerprint, path]);

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
          await withLoading(async () => {
            const sc = await getServiceController(fingerprint);
            const folder = await sc.files.fs.mkDir(value, path);
            setRemoteItems((prevItems) => [...prevItems, {
              ...folder,
              isSelected: false,
              deviceFingerprint: fingerprint,
            }]);
          }, { title: 'Creating folder...', errorTitle: 'Error' });
        }
      },
    });
  }, [fingerprint, openInputPopup, path, setRemoteItems, withLoading]);

  const deleteItems = useCallback((items: FileRemoteItem[], onDeleted?: () => void) => {
    showAlert(
      'Delete Items',
      `Are you sure you want to delete ${items.length} item(s)? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await withLoading(async () => {
              const sc = await getServiceController(fingerprint);
              const deleted = await sc.files.fs.unlinkMultiple(items.map(i => i.path));
              setRemoteItems((prevItems) =>
                prevItems.filter((item) => !deleted.some((p) => p === item.path))
              );
              onDeleted?.();
            }, { title: `Deleting ${items.length} item(s).`, errorTitle: 'Error' });
          },
        },
      ]
    );
  }, [fingerprint, setRemoteItems, showAlert, withLoading]);

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
          await withLoading(async () => {
            const sc = await getServiceController(fingerprint);
            const renamedItem = await sc.files.fs.rename(item.path, value);
            setRemoteItems((prevItems) =>
              prevItems.map((it) =>
                it.path === item.path ? { ...renamedItem, isSelected: false, deviceFingerprint: fingerprint } : it
              )
            );
          }, { title: `Renaming ${itemKind}.`, errorTitle: 'Error' });
        }
      },
    });
  }, [fingerprint, openInputPopup, setRemoteItems, withLoading]);

  const deleteSelectedItems = useCallback(() => {
    if (selectedFiles.length === 0) return;
    deleteItems(selectedFiles, () => {
      setSelectedFiles([]);
      setSelectMode(false);
    });
  }, [deleteItems, selectedFiles]);

  const moveItems = useCallback(async (destFingerprint: string | null, destPath: string, deleteSource: boolean) => {
    if (!itemsToMove || itemsToMove.length === 0) return;
    const items = [...itemsToMove];
    setItemsToMove(null);
    const filePaths = items.map(i => i.path);
    await withLoading(async () => {
      const serviceController = await getServiceController(destFingerprint);
      await serviceController.files.move(destFingerprint, destPath, filePaths, deleteSource);
      if (deleteSource) {
        setRemoteItems((prevItems) =>
          prevItems.filter((item) => !items.some((i) => i.path === item.path))
        );
      }
    }, { title: `Moving ${items.length} item(s)...`, errorTitle: 'Error' });
  }, [setRemoteItems, itemsToMove, withLoading]);

  const shareItem = useCallback(async (item: FileRemoteItem) => {
    await withLoading(async () => {
      const localSc = getLocalServiceController();
      await localSc.files.shareFiles(item.deviceFingerprint || null, [item.path]);
    }, { title: 'Sharing...', errorTitle: 'Error' });
  }, [withLoading]);

  useEffect(() => {
    navigation.setOptions({
      title: folderName,
      headerTitle: selectMode ? `${selectedFiles.length} selected` : folderName,
      headerTransparent: isGlassEnabled,
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
    });
  }, [navigation, folderName, selectMode, selectedFiles.length, filesViewMode, setFilesViewMode, sortBy, updatedSortBy, newFolder, deleteSelectedItems, selectedFiles]);

  const sendToDevice = useCallback(async (items: FileRemoteItem[], destFingerprint: string | null) => {
    await sendAssets(destFingerprint, items, {
      getPath: (item) => item.path,
      getSourceFingerprint: (item) => item.deviceFingerprint,
    });
  }, [sendAssets]);

  const openInDevice = useCallback(async (item: FileRemoteItem, destFingerprint: string) => {
    await withLoading(async () => {
      const sc = await getServiceController(destFingerprint);
      await sc.files.openFile(item.deviceFingerprint || modules.config.FINGERPRINT, item.path);
    }, { title: 'Opening item in device.', errorTitle: 'Error' });
  }, [withLoading]);

  const handleQuickAction = useCallback(async (action: FileQuickActionType) => {
    switch (action.type) {
      case 'delete':
        deleteItems([action.item]);
        break;
      case 'move':
        setItemsToMove([action.item]);
        break;
      case 'rename':
        renameItem(action.item);
        break;
      case 'info':
        showAlert('File Info', `Path: ${action.item.path}\nSize: ${action.item.size} bytes`);
        break;
      case 'openInDevice':
        if (action.targetDeviceFingerprint !== undefined) {
          await openInDevice(action.item, action.targetDeviceFingerprint);
        }
        break;
      case 'export':
        await shareItem(action.item);
        break;
      case 'sendToDevice':
        if (action.targetDeviceFingerprint !== undefined) {
          await sendToDevice([action.item], action.targetDeviceFingerprint);
        }
        break;
      default:
        console.warn('Unknown quick action:', action);
    }
  }, [deleteItems, openInDevice, renameItem, sendToDevice, shareItem, showAlert]);

  return (
    <UIView style={{ flex: 1 }}>
      {!!route &&
        <FilesGrid
          items={remoteItems}
          isLoading={isLoading}
          error={error}
          footerComponent={
            <View style={{ paddingHorizontal: 10, paddingVertical: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 120 }}>
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
            isGlassEnabled ?
              <View style={{ marginTop: headerHeight }} />
              : undefined
          }
        />
      }
      <FilePickerModal
        isOpen={!!itemsToMove}
        pickerType="folder"
        onDone={async (items) => {
          if (!items || items.length === 0) {
            setItemsToMove(null);
            return;
          }
          await moveItems(items[0].deviceFingerprint, items[0].path, true);
        }}
      />
    </UIView>
  );
}
