import DeviceSelectorRow from '@/components/deviceSelectorRow';
import { UIView } from '@/components/ui/UIView';
import { useAppState } from '@/hooks/useAppState';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import PhotosLibrarySelectorModal from '@/components/photosLibrarySelectorModal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhotoLibraryLocation } from 'shared/types';
import { usePhotoLibraries } from '@/hooks/usePhotos';
import { PhotosGrid } from '@/components/photosGrid';
import { PhotosSortOption, PhotoView, PhotosQuickAction } from '@/lib/types';
import { UIButton } from '@/components/ui/UIButton';
import { getLocalServiceController, getServiceController, isIos } from '@/lib/utils';
import { useAlert } from '@/hooks/useAlert';

export default function PhotosScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  // Tab bar height is typically 49 on iOS and 56 on Android, plus safe area
  const tabBarHeight = (isIos ? 49 : 56) + insets.bottom;

  const { selectedFingerprint } = useAppState();
  const {
    photoLibraries,
    isLoading: isLoadingLibraries,
    error: librariesError,
  } = usePhotoLibraries(selectedFingerprint);

  const [isLibrarySelectorOpen, setIsLibrarySelectorOpen] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState<null | PhotoLibraryLocation>(null);
  const currentFingerprintRef = useRef<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoView[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);
  const { showAlert } = useAlert();

  useEffect(() => {
    setSelectedLibrary(null);
    setSelectMode(false);
    setSelectedPhotos([]);
    setDeletedPhotoIds([]);
    currentFingerprintRef.current = selectedFingerprint;
  }, [selectedFingerprint]);

  useEffect(() => {
    if (isLoadingLibraries) return;
    if (photoLibraries.length > 0 && !selectedLibrary) {
      setSelectedLibrary(photoLibraries[0]);
    }
  }, [photoLibraries, selectedLibrary, isLoadingLibraries]);

  const handleSelectPhoto = useCallback((photo: PhotoView) => {
    setSelectedPhotos((prevSelected) => {
      const isAlreadySelected = prevSelected.some((p) => p.id === photo.id);
      if (isAlreadySelected) {
        return prevSelected;
      }
      return [...prevSelected, photo];
    });
  }, []);

  const handleDeselectPhoto = useCallback((photo: PhotoView) => {
    setSelectedPhotos((prevSelected) =>
      prevSelected.filter((p) => p.id !== photo.id)
    );
  }, []);

  const sharePhoto = useCallback(async (photo: PhotoView) => {
    const localSc = getLocalServiceController();
    const forceCache = photo.deviceFingerprint === null && Platform.OS === 'ios';
    console.log("Sharing photo with forceCache =", forceCache);
    try {
      await localSc.files.shareFiles(photo.deviceFingerprint, [photo.fileId], forceCache);
    } catch (e) {
      console.error("Failed to share photo:", e);
      showAlert("Error", "Failed to share photo. Please try again.");
    }
  }, [showAlert]);

  const deletePhotos = useCallback(async (photos: PhotoView[]) => {
    if (!selectedLibrary) return;

    showAlert("Confirm Delete", `Are you sure you want to delete ${photos.length} photo(s)? This action cannot be undone.`, [
      {
        text: "Cancel",
        style: "cancel"
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const sc = await getServiceController(selectedFingerprint);
            const resp = await sc.photos.deletePhotos(selectedLibrary.id, photos.map(p => p.id));
            if (resp.deleteCount === 0) {
              showAlert("Error", "Could not delete photos. Please try again.");
            } else {
              setDeletedPhotoIds((prev) => [...prev, ...resp.deletedIds]);
              setSelectedPhotos((prevSelected) =>
                prevSelected.filter((p) => !resp.deletedIds.includes(p.id))
              );
            }
          } catch (e) {
            console.error("Failed to delete photos:", e);
            showAlert("Error", "Failed to delete photos. Please try again.");
          }
        }
      }
    ]);
  }, [selectedFingerprint, selectedLibrary, showAlert]);

  const openInDevice = useCallback(async (photo: PhotoView, destFingerprint: string) => {
    try {
      const sc = await getServiceController(destFingerprint);
      await sc.files.openFile(photo.deviceFingerprint || modules.config.FINGERPRINT, photo.fileId);
    }
    catch (error) {
      console.error('Failed to open item in device:', error);
      showAlert('Error', 'Failed to open item in device. Please try again.');
    }
  }, [showAlert]);

  const sendToDevice = useCallback(async (items: PhotoView[], destFingerprint: string | null) => {
    try {
      const sc = await getServiceController(destFingerprint);
      for (const item of items) {
        await sc.files.download(item.deviceFingerprint || modules.config.FINGERPRINT, item.fileId);
      }
    }
    catch (error) {
      console.error('Failed to send items to device:', error);
      showAlert('Error', 'Failed to send items to device. Please try again.');
    }
  }, [showAlert]);

  const handleQuickAction = useCallback((action: PhotosQuickAction) => {
    switch (action.type) {
      case 'export':
        sharePhoto(action.photo);
        break;
      case 'openInDevice':
        if (action.targetDeviceFingerprint) {
          openInDevice(action.photo, action.targetDeviceFingerprint);
        }
        break;
      case 'sendToDevice':
        sendToDevice([action.photo], action.targetDeviceFingerprint || null);
        break;
      case 'delete':
        deletePhotos([action.photo]);
        break;
      case 'info':
        // Implement info display logic here
        break;
      default:
        console.warn('Unknown action type:', action.type);
    }
  }, [sharePhoto, deletePhotos, openInDevice, sendToDevice]);

  const fetchOpts = useMemo(() => {
    if (selectedFingerprint !== currentFingerprintRef.current) {
      return null;
    }
    if (!selectedLibrary) {
      return null;
    }
    return {
      library: selectedLibrary,
      deviceFingerprint: selectedFingerprint,
      sortBy: PhotosSortOption.CapturedOn,
      ascending: false,
    };
  }, [selectedLibrary, selectedFingerprint]);

  const header = (<View style={{ paddingTop: isIos ? headerHeight : 0 }} >
    <DeviceSelectorRow />
  </View>);

  return (
    <UIView style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: 'Photos',
          headerTitle: selectMode ? `${selectedPhotos.length} selected` : 'Photos',
          //headerLargeTitle: true
          headerTransparent: isIos,
          headerLeft: isIos ? () => <UIHeaderButton text={selectMode ? 'Done' : 'Select'} isHighlight={selectMode} onPress={() => setSelectMode(!selectMode)} /> : undefined,
          headerRight: () => {
            // On ios if not in select mode, we don't show any buttons on the right
            // if we return empty View it will show a empty button space
            if (!selectMode && isIos) return null;
            return (
              <>
                {!isIos && <UIHeaderButton text={selectMode ? 'Done' : 'Select'} isHighlight={selectMode} onPress={() => setSelectMode(!selectMode)} />}
                {selectMode && (
                  <>
                    <UIHeaderButton name="trash" disabled={selectedPhotos.length === 0} onPress={() => {
                      deletePhotos(selectedPhotos);
                    }} />
                    <UIHeaderButton
                      disabled={selectedPhotos.length !== 1}
                      name="square.and.arrow.up"
                      onPress={() => {
                        if (selectedPhotos.length === 1) {
                          sharePhoto(selectedPhotos[0]);
                        }
                      }} />
                  </>
                )}
              </>
            );
          }
        }}
      />
      <PhotosGrid
        fetchOpts={fetchOpts}
        deletedIds={deletedPhotoIds}
        selectMode={selectMode}
        onSelectPhoto={handleSelectPhoto}
        onDeselectPhoto={handleDeselectPhoto}
        onQuickAction={handleQuickAction}
        headerComponent={header}
      />
      <PhotosLibrarySelectorModal
        isOpen={isLibrarySelectorOpen}
        onDone={(lib) => {
          setIsLibrarySelectorOpen(false);
          lib && setSelectedLibrary(lib);
        }}
        selectedLibrary={selectedLibrary || undefined}
        libraries={photoLibraries}
      />
      {
        !selectMode && !isLoadingLibraries && photoLibraries.length > 0 && !librariesError &&
        <View style={{ position: 'absolute', bottom: tabBarHeight + (isIos ? 0 : 36), left: 0, right: 0, justifyContent: 'center', alignItems: 'center' }}>
          <UIButton
            size='md'
            type='secondary'
            onPress={() => {
              setIsLibrarySelectorOpen(true);
            }}
            title={selectedLibrary ? selectedLibrary.name : 'Select Library'}
          />
        </View>
      }
    </UIView>
  );
}
