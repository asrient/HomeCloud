import { PhotosFetchOptions, PhotoView } from '@/lib/types';
import { usePhotos } from '@/hooks/usePhotos';
import { ActivityIndicator, View } from 'react-native';
import { UIText } from './ui/UIText';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { getServiceController } from '@/lib/utils';
import { FlashList } from "@shopify/flash-list";


export function PhotoThumbnail({ item }: { item: PhotoView }) {
    const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(item.thumbnail || null);

    const fetchThumbnailSrc = useCallback(async (item: PhotoView) => {
        if (item.thumbnail) {
            return item.thumbnail;
        }
        const serviceController = await getServiceController(item.deviceFingerprint);
        item.thumbnail = await serviceController.thumbnail.generateThumbnailURI(item.fileId);
        return item.thumbnail;
    }, []);

    useEffect(() => {
        // console.log('Fetching thumbnail for photo', item.id);
        fetchThumbnailSrc(item)
        .then((src) => {
            setThumbnailSrc(src || null);
        })
        .catch((err) => {
            console.error('Error fetching thumbnail for photo', item.id, err);
        });
    }, [item, fetchThumbnailSrc]);

    if (!thumbnailSrc) {
        return (
            <View style={{ 
                width: '100%', 
                height: '100%', 
            backgroundColor: '#ccc', 
            justifyContent: 'center', 
            alignItems: 'center' 
            }}>
            </View>
        );
    }

    return (
        <Image
            source={{ uri: thumbnailSrc, cacheKey: `${item.deviceFingerprint}-${item.libraryId}-${item.id}` }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
        />
    );
}


export function PhotosGrid({ fetchOpts, headerComponent }: {
    fetchOpts: PhotosFetchOptions;
    headerComponent?: React.ReactElement;
}) {

    const { photos, isLoading, error, load, hasMore } = usePhotos(fetchOpts);

    if (isLoading && photos.length === 0) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (error) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <UIText>Error loading photos: {error}</UIText>
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }} >
        <FlashList
            ListHeaderComponent={headerComponent}
            data={photos}
            keyExtractor={(item) => item.id}
            numColumns={3}
            refreshing={isLoading}
            renderItem={({ item }) => (
                <View style={{ flex: 1 / 3, aspectRatio: 1, margin: 1 }}>
                    <PhotoThumbnail item={item} />
                </View>
            )}
            onEndReached={() => {
                if (hasMore && !isLoading) {
                    load();
                }
            }}
            onEndReachedThreshold={0.5}
        />
        </View>
    );
}
