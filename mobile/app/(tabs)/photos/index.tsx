import DeviceSelectorRow from '@/components/deviceSelectorRow';
import { UIView } from '@/components/ui/UIView';
import { useAppState } from '@/hooks/useAppState';
import { Button, useHeaderHeight } from '@react-navigation/elements';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { HeaderButton } from '@/components/ui/HeaderButton';
import PhotosLibrarySelectorModal from '@/components/photosLibrarySelectorModal';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PhotoLibraryLocation } from 'shared/types';
import { usePhotoLibraries } from '@/hooks/usePhotos';
import { PhotosGrid } from '@/components/photosGrid';
import { PhotosSortOption, PhotoView } from '@/lib/types';

export default function PhotosScreen() {
  const headerHeight = useHeaderHeight();

  const { selectedFingerprint } = useAppState();
  const {
    photoLibraries,
    isLoading: isLoadingLibraries,
  } = usePhotoLibraries(selectedFingerprint);

  const [isLibrarySelectorOpen, setIsLibrarySelectorOpen] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState<null | PhotoLibraryLocation>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoView[]>([]);

  useEffect(() => {
    if (photoLibraries.length > 0 && !selectedLibrary) {
      setSelectedLibrary(photoLibraries[0]);
    }
  }, [photoLibraries, selectedLibrary]);

  useEffect(() => {
    setSelectedLibrary(null);
    setSelectMode(false);
  }, [selectedFingerprint]);

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

  const fetchOpts = useMemo(() => {
    if (!selectedLibrary) {
      return null;
    }
    return {
      library: selectedLibrary,
      deviceFingerprint: selectedFingerprint,
      sortBy: PhotosSortOption.CapturedOn,
    };
  }, [selectedLibrary, selectedFingerprint]);

  return (
    <UIView style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: 'Photos',
          headerTitle: selectMode ? `${selectedPhotos.length} selected` : 'Photos',
          //headerLargeTitle: true
          headerTransparent: true,
          headerLeft: () =>
            <View>
              <HeaderButton text={selectMode ? 'Done' : 'Select'} isActive={selectMode} onPress={() => setSelectMode(!selectMode)} />
            </View>
          ,
        }}
      />
      {
        fetchOpts &&
        <PhotosGrid
          fetchOpts={fetchOpts}
          selectMode={selectMode}
          onSelectPhoto={handleSelectPhoto}
          onDeselectPhoto={handleDeselectPhoto}
          headerComponent={<View style={{ paddingTop: headerHeight, left: 0 }} >
            <DeviceSelectorRow />
          </View>}
        />
      }
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
        !selectMode &&
        <View style={{ padding: 3, bottom: 90, left: 0, justifyContent: 'center', alignItems: 'center' }}>
          <Button
            style={{ paddingHorizontal: 10, borderRadius: 100, width: 200, backgroundColor: 'white' }}
            disabled={isLoadingLibraries || photoLibraries.length === 0}
            onPress={() => {
              setIsLibrarySelectorOpen(true);
            }} >
            {selectedLibrary && !isLoadingLibraries ? selectedLibrary.name : 'Loading...'}
          </Button>
        </View>
      }
    </UIView>
  );
}
