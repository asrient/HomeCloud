import DeviceSelectorRow from '@/components/deviceSelectorRow';
import { UIView } from '@/components/ui/UIView';
import { useAppState } from '@/hooks/useAppState';
import { Button, useHeaderHeight } from '@react-navigation/elements';
import { Stack, useRouter } from 'expo-router';
import { View, ScrollView } from 'react-native';
import { HeaderButton } from '@/components/ui/HeaderButton';
import PhotosLibrarySelectorModal from '@/components/photosLibrarySelectorModal';
import { useEffect, useState } from 'react';
import { PhotoLibraryLocation } from 'shared/types';
import { usePhotoLibraries } from '@/hooks/usePhotos';
import { PhotosGrid } from '@/components/photosGrid';
import { PhotosSortOption } from '@/lib/types';

export default function PhotosScreen() {

  const router = useRouter();
  const headerHeight = useHeaderHeight();

  const { selectedFingerprint } = useAppState();
  const {
    photoLibraries,
    isLoading: isLoadingLibraries,
    error: librariesError,
    reload: reloadLibraries
  } = usePhotoLibraries(selectedFingerprint);

  const [isLibrarySelectorOpen, setIsLibrarySelectorOpen] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState<null | PhotoLibraryLocation>(null);

  useEffect(() => {
    if (photoLibraries.length > 0 && !selectedLibrary) {
      setSelectedLibrary(photoLibraries[0]);
    }
  }, [photoLibraries, selectedLibrary]);

  useEffect(() => {
    setSelectedLibrary(null);
  }, [selectedFingerprint]);

  return (
    <UIView style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: 'Photos',
          headerTitle: 'Photos',
          //headerLargeTitle: true,
          headerTransparent: true,
          headerRight: () =>
            <View>
              <HeaderButton name="gear" onPress={() => router.navigate('/settings')} />
            </View>
          ,
        }}
      />

      {
        selectedLibrary &&
        <PhotosGrid fetchOpts={{
          library: selectedLibrary,
          deviceFingerprint: selectedFingerprint,
          sortBy: PhotosSortOption.CapturedOn,
        }}
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
      <View style={{ padding: 3, bottom: 90, left: 0, justifyContent: 'center', alignItems: 'center' }}>
        <Button
        style={{ paddingHorizontal: 10,  borderRadius: 100, width: 200, backgroundColor: 'white' }}
          disabled={isLoadingLibraries || photoLibraries.length === 0}
          onPress={() => {
            setIsLibrarySelectorOpen(true);
          }} >
          {selectedLibrary && !isLoadingLibraries ? selectedLibrary.name : 'Loading...'}
        </Button>
      </View>
    </UIView>
  );
}
