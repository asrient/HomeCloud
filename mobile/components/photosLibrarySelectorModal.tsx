import { View, Modal, ScrollView, Pressable } from 'react-native';
import { UIView } from '@/components/ui/UIView';
import { UIText } from '@/components/ui/UIText';
import { UIStatusBar } from '@/components/ui/UIStatusBar';
import { PhotoLibraryLocation } from 'shared/types';

export default function PhotosLibrarySelectorModal({ isOpen, onDone, selectedLibrary, libraries }: {
    isOpen: boolean;
    onDone: (lib: PhotoLibraryLocation | null) => void;
    selectedLibrary?: PhotoLibraryLocation;
    libraries: PhotoLibraryLocation[];
}) {

    return (

        <Modal animationType="slide"
            presentationStyle='pageSheet'
            transparent={false} visible={isOpen} onRequestClose={() => {
                onDone(null);
            }}>
            <UIStatusBar type="sheet" />
            <UIView style={{ flex: 1 }}>

                <View style={{ padding: 20 }} >
                    <UIText type="subtitle">Select Library</UIText>
                </View>
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
                                        borderBottomColor: '#ccc',
                                        backgroundColor: isSelected ? '#007AFF' : 'transparent',
                                    }}
                                >
                                    <UIText 
                                    lightColor={isSelected ? 'white' : undefined} 
                                    darkColor={isSelected ? 'white' : undefined}
                                    >
                                        {lib.name}
                                    </UIText>
                                </Pressable>
                            )
                        })
                    }
                    <View style={{ height: 30 }} />
                </ScrollView>
            </UIView>

        </Modal>
    );
}
