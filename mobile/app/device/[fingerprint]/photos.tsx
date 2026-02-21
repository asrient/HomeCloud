import { UIView } from '@/components/ui/UIView';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Platform, View } from 'react-native';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import PhotosLibrarySelectorModal from '@/components/photosLibrarySelectorModal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhotoLibraryLocation } from 'shared/types';
import { usePhotoLibraries } from '@/hooks/usePhotos';
import { PhotosGrid } from '@/components/photosGrid';
import { PhotosSortOption, PhotoView, PhotosQuickAction } from '@/lib/types';
import { UIButton } from '@/components/ui/UIButton';
import { getLocalServiceController, getServiceController, isIos, isGlassEnabled } from '@/lib/utils';
import { useAlert } from '@/hooks/useAlert';
import { useSendAssets } from '@/hooks/useSendAssets';
import { useManagedLoading } from '@/hooks/useManagedLoading';

export default function DevicePhotosScreen() {
  const { fingerprint: routeFingerprint } = useLocalSearchParams<{ fingerprint: string }>();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const deviceFingerprint = routeFingerprint === 'local' ? null : routeFingerprint;

  const {
    photoLibraries,
    isLoading: isLoadingLibraries,
    error: librariesError,
  } = usePhotoLibraries(deviceFingerprint);

  const [isLibrarySelectorOpen, setIsLibrarySelectorOpen] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState<null | PhotoLibraryLocation>(null);
  const currentFingerprintRef = useRef<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoView[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);
  const { showAlert } = useAlert();
  const { sendAssets } = useSendAssets();
  const { withLoading } = useManagedLoading();

  useEffect(() => {
    setSelectedLibrary(null);
    setSelectMode(false);
    setSelectedPhotos([]);
    setDeletedPhotoIds([]);
    currentFingerprintRef.current = deviceFingerprint;
  }, [deviceFingerprint]);

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
    const forceCache = photo.deviceFingerprint === null && Platform.OS === 'ios';
    await withLoading(async () => {
      const localSc = getLocalServiceController();
      await localSc.files.shareFiles(photo.deviceFingerprint, [photo.fileId], forceCache);
    }, { title: 'Sharing photo...', errorTitle: 'Error' });
  }, [withLoading]);

  const deletePhotos = useCallback((photos: PhotoView[], onDeleted?: () => void) => {
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
          await withLoading(async () => {
            const sc = await getServiceController(deviceFingerprint);
            const resp = await sc.photos.deletePhotos(selectedLibrary.id, photos.map(p => p.id));
            if (resp.deleteCount === 0) {
              throw new Error("Could not delete photos. Please try again.");
            }
            setDeletedPhotoIds((prev) => [...prev, ...resp.deletedIds]);
            setSelectedPhotos((prevSelected) =>
              prevSelected.filter((p) => !resp.deletedIds.includes(p.id))
            );
            onDeleted?.();
          }, { title: `Deleting ${photos.length} photo(s)...`, errorTitle: 'Error' });
        }
      }
    ]);
  }, [deviceFingerprint, selectedLibrary, showAlert, withLoading]);

  const openInDevice = useCallback(async (photo: PhotoView, destFingerprint: string) => {
    await withLoading(async () => {
      const sc = await getServiceController(destFingerprint);
      await sc.files.openFile(photo.deviceFingerprint || modules.config.FINGERPRINT, photo.fileId);
    }, { title: 'Opening item in device.', errorTitle: 'Error' });
  }, [withLoading]);

  const sendToDevice = useCallback(async (items: PhotoView[], destFingerprint: string | null) => {
    await sendAssets(destFingerprint, items, {
      getPath: (item) => item.fileId,
      getSourceFingerprint: (item) => item.deviceFingerprint,
      label: 'photos',
    });
  }, [sendAssets]);

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
        break;
      default:
        console.warn('Unknown action type:', action.type);
    }
  }, [sharePhoto, deletePhotos, openInDevice, sendToDevice]);

  const fetchOpts = useMemo(() => {
    if (deviceFingerprint !== currentFingerprintRef.current) {
      return null;
    }
    if (!selectedLibrary) {
      return null;
    }
    return {
      library: selectedLibrary,
      deviceFingerprint: deviceFingerprint,
      sortBy: PhotosSortOption.CapturedOn,
      ascending: false,
    };
  }, [selectedLibrary, deviceFingerprint]);

  return (
    <UIView style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: 'Photos',
          headerTitle: selectMode ? `${selectedPhotos.length} selected` : 'Photos',
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: isGlassEnabled,
          headerRight: () => {
            return (
              <>
                <UIHeaderButton text={selectMode ? 'Done' : 'Select'} isHighlight={selectMode} onPress={() => setSelectMode(!selectMode)} />
                {selectMode && (
                  <>
                    <UIHeaderButton name="trash" disabled={selectedPhotos.length === 0} onPress={() => {
                      deletePhotos(selectedPhotos, () => {
                        setSelectMode(false);
                      });
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
        headerComponent={
          isGlassEnabled ?
            <View style={{ paddingTop: headerHeight }} />
            : undefined
        }
      />
      <PhotosLibrarySelectorModal
        isOpen={isLibrarySelectorOpen}
        onDone={(lib) => {
          setIsLibrarySelectorOpen(false);
          if (lib && lib.id !== selectedLibrary?.id) {
            setSelectMode(false);
            setSelectedPhotos([]);
            setSelectedLibrary(lib);
          }
        }}
        selectedLibrary={selectedLibrary || undefined}
        libraries={photoLibraries}
      />
      {
        !selectMode && !isLoadingLibraries && photoLibraries.length > 0 && !librariesError &&
        <View style={{ position: 'absolute', bottom: insets.bottom + (isIos ? 10 : 36), left: 0, right: 0, justifyContent: 'center', alignItems: 'center' }}>
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
