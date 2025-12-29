import DeviceSelectorRow from '@/components/deviceSelectorRow';
import { UIView } from '@/components/ui/UIView';
import { useAppState } from '@/hooks/useAppState';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import PhotosLibrarySelectorModal from '@/components/photosLibrarySelectorModal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhotoLibraryLocation } from 'shared/types';
import { usePhotoLibraries } from '@/hooks/usePhotos';
import { PhotosGrid } from '@/components/photosGrid';
import { PhotosSortOption, PhotoView } from '@/lib/types';
import { UIButton } from '@/components/ui/UIButton';

export default function PhotosScreen() {
  const headerHeight = useHeaderHeight();

  const { selectedFingerprint } = useAppState();
  const {
    photoLibraries,
    isLoading: isLoadingLibraries,
  } = usePhotoLibraries(selectedFingerprint);

  const [isLibrarySelectorOpen, setIsLibrarySelectorOpen] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState<null | PhotoLibraryLocation>(null);
  const currentFingerprintRef = useRef<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoView[]>([]);

  useEffect(() => {
    setSelectedLibrary(null);
    setSelectMode(false);
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
          headerLeft: () => <UIHeaderButton text={selectMode ? 'Done' : 'Select'} isHighlight={selectMode} onPress={() => setSelectMode(!selectMode)} />
          ,
          headerRight: () => {
            if (!selectMode) return null;
            return (
              <>
                <UIHeaderButton name="trash" onPress={() => { }} />
                <UIHeaderButton name="square.and.arrow.up" onPress={() => { }} />
              </>
            );
          }
        }}
      />
      {
        fetchOpts &&
        <PhotosGrid
          fetchOpts={fetchOpts}
          selectMode={selectMode}
          onSelectPhoto={handleSelectPhoto}
          onDeselectPhoto={handleDeselectPhoto}
          headerComponent={<View style={{ paddingTop: headerHeight }} >
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
        <View style={{ position: 'absolute', bottom: 90, left: 0, right: 0, justifyContent: 'center', alignItems: 'center' }}>
          <UIButton
            size='md'
            type='secondary'
            disabled={isLoadingLibraries || photoLibraries.length === 0}
            onPress={() => {
              setIsLibrarySelectorOpen(true);
            }}
            title={selectedLibrary && !isLoadingLibraries ? selectedLibrary.name : 'Loading...'}
          />
        </View>
      }
    </UIView>
  );
}
