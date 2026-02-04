import { View, ScrollView, Pressable } from 'react-native';
import { UIText } from '@/components/ui/UIText';
import { UIPageSheet } from '@/components/ui/UIPageSheet';
import { PhotoLibraryLocation } from 'shared/types';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function PhotosLibrarySelectorModal({ isOpen, onDone, selectedLibrary, libraries }: {
    isOpen: boolean;
    onDone: (lib: PhotoLibraryLocation | null) => void;
    selectedLibrary?: PhotoLibraryLocation;
    libraries: PhotoLibraryLocation[];
}) {
    const separatorColor = useThemeColor({}, 'seperator');

    return (
        <UIPageSheet
            isOpen={isOpen}
            onClose={() => onDone(null)}
            title="Select Library"
        >
            <ScrollView style={{ flex: 1 }}>
                {
                    libraries.map((lib) => {
                        const isSelected = selectedLibrary ? selectedLibrary.id === lib.id : false;
                        return (
                            <Pressable
                                key={lib.id}
                                onPress={() => onDone(lib)}
                                style={{
                                    padding: 15,
                                    borderBottomWidth: 1,
                                    borderBottomColor: separatorColor,
                                    backgroundColor: isSelected ? '#007AFF' : 'transparent',
                                }}
                            >
                                <UIText color={isSelected ? 'highlightText' : undefined}>
                                    {lib.name}
                                </UIText>
                            </Pressable>
                        )
                    })
                }
                <View style={{ height: 30 }} />
            </ScrollView>
        </UIPageSheet>
    );
}
