import { PhotosFetchOptions, PhotoView } from '@/lib/types';
import { usePhotos } from '@/hooks/usePhotos';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { UIText } from './ui/UIText';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServiceController } from '@/lib/utils';
import { FlashList } from "@shopify/flash-list";
import { ThumbnailCheckbox } from './ThumbnailCheckbox';
import { PhotosPreviewModal } from './photosPreviewModal';
import { UIContextMenu } from './ui/UIContextMenu';
import { getPeerIconName } from './ui/getPeerIconName';


export type PhotosQuickAction = {
    type: 'export' | 'openInDevice' | 'sendToDevice' | 'delete' | 'info';
    targetDeviceFingerprint?: string;
    photo: PhotoView;
}

export function PhotoThumbnail({ item, onPress, isSelectMode, onQuickAction }: { item: PhotoView, onPress?: (item: PhotoView) => void, isSelectMode?: boolean, onQuickAction?: (action: PhotosQuickAction) => void }) {
    const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(item.thumbnail || null);
    const [isSelected, setIsSelected] = useState(item.isSelected || false);

    const peers = useMemo(() => {
        const localSc = modules.getLocalServiceController();
        return localSc.app.getPeers();
    }, []);

    useEffect(() => {
        setIsSelected(item.isSelected || false);
        setThumbnailSrc(item.thumbnail || null);
    }, [item]);

    useEffect(() => {
        if (!isSelectMode) {
            setIsSelected(false);
            item.isSelected = false;
        }
    }, [isSelectMode, item]);

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

    const handlePress = useCallback(() => {
        if (isSelectMode) {
            const newSelected = !isSelected;
            setIsSelected(newSelected);
            item.isSelected = newSelected;
        }
        if (onPress) {
            onPress(item);
        }
    }, [isSelectMode, onPress, isSelected, item]);

    const handleQuickAction = useCallback((id: string, data: string | undefined) => {
        if (!onQuickAction) {
            return;
        }
        let type: PhotosQuickAction['type'] | null = null;
        let targetDeviceFingerprint: string | undefined = data;
        switch (id) {
            case 'info':
                type = 'info';
                break;
            case 'delete':
                type = 'delete';
                break;
            case 'export':
                type = 'export';
                break;
            case 'openInDevice':
                type = 'openInDevice';
                break;
            case 'sendToDevice':
                type = 'sendToDevice';
                break;
            default:
                type = null;
        }
        if (!type) {
            console.error('Unknown quick action type for action:', id);
            return;
        }
        onQuickAction({
            type,
            targetDeviceFingerprint,
            photo: item,
        });
    }, [item, onQuickAction]);

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
        <UIContextMenu<string>
            style={{ width: '100%', height: '100%' }}
            // title='Meow'
            actions={[
                { id: 'export', title: "Export", icon: "square.and.arrow.up" },
                {
                    id: 'openInDevice',
                    title: "Open in device",
                    icon: "macbook.and.iphone",
                    actions: peers.filter(peer => peer.fingerprint !== modules.config.FINGERPRINT).map((peer) => ({
                        id: 'openInDevice',
                        title: peer.deviceName,
                        icon: getPeerIconName(peer),
                        data: peer.fingerprint,
                    })),
                },
                {
                    id: 'sendToDevice',
                    title: "Send to device",
                    icon: "arrow.up.message",
                    actions: peers.filter(peer => peer.fingerprint !== item.deviceFingerprint).map((peer) => ({
                        id: 'sendToDevice',
                        title: peer.deviceName,
                        icon: getPeerIconName(peer),
                        data: peer.fingerprint,
                    })),
                },
                { id: 'info', title: "Info", icon: "info.circle" },
                { id: 'delete', title: "Delete", icon: "trash", destructive: true },
            ]}
            onAction={handleQuickAction}
            onPreviewPress={handlePress}
        >
            {/* onLongPress is needed to prevent onPress from firing when context menu opens on Android */}
            <Pressable onPress={handlePress} onLongPress={() => {}} style={{ width: '100%', height: '100%' }}>
                <Image
                    source={{ uri: thumbnailSrc, cacheKey: `${item.deviceFingerprint}-${item.libraryId}-${item.id}` }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                />
                {
                    isSelectMode &&
                    <ThumbnailCheckbox position='top-right' isSelected={isSelected} />
                }
            </Pressable>
        </UIContextMenu>
    );
}


export function PhotosGrid({ fetchOpts, headerComponent, selectMode, onSelectPhoto, onDeselectPhoto, onPreviewPhoto, onQuickAction, deletedIds }: {
    fetchOpts: PhotosFetchOptions;
    deletedIds?: string[];
    headerComponent?: React.ReactElement;
    selectMode?: boolean;
    onSelectPhoto?: (photo: PhotoView) => void;
    onDeselectPhoto?: (photo: PhotoView) => void;
    onPreviewPhoto?: (photo: PhotoView) => void;
    onQuickAction?: (action: PhotosQuickAction) => void;
}) {

    const { photos, isLoading, error, load, hasMore, setPhotos } = usePhotos(fetchOpts);
    const [renderKey, setRenderKey] = useState(0);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    useEffect(() => {
        // Force re-render when selectMode changes to update thumbnails
        console.log('Select mode changed:', selectMode);
        setRenderKey((prev) => prev + 1);
    }, [selectMode]);

    useEffect(() => {
        if (deletedIds && deletedIds.length > 0) {
            setPhotos((prevPhotos) => prevPhotos.filter(photo => !deletedIds.includes(photo.id)));
        }
    }, [deletedIds, setPhotos]);

    const handlePhotoPress = useCallback((photo: PhotoView) => {
        // Handle photo press based on selectMode
        console.log('Photo pressed:', photo.id, 'selectMode:', selectMode);
        if (selectMode) {
            if (photo.isSelected) {
                onSelectPhoto && onSelectPhoto(photo);
            } else {
                onDeselectPhoto && onDeselectPhoto(photo);
            }
        } else {
            // Open preview modal
            const index = photos.findIndex(p => p.id === photo.id);
            if (index !== -1) {
                setPreviewIndex(index);
                setIsPreviewOpen(true);
            }
            onPreviewPhoto && onPreviewPhoto(photo);
        }
    }, [selectMode, onSelectPhoto, onDeselectPhoto, onPreviewPhoto, photos]);

    const handleClosePreview = useCallback((finalIndex?: number) => {
        setIsPreviewOpen(false);
        setPreviewIndex(null);
    }, []);

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
                extraData={renderKey}
                keyExtractor={(item) => item.id}
                numColumns={3}
                refreshing={isLoading}
                renderItem={({ item }) => (
                    <View style={{ flex: 1 / 3, aspectRatio: 1, margin: 1 }}>
                        <PhotoThumbnail item={item} isSelectMode={selectMode} onPress={handlePhotoPress} onQuickAction={onQuickAction} />
                    </View>
                )}
                onEndReached={() => {
                    if (hasMore && !isLoading) {
                        console.log('Loading more photos...');
                        load();
                    }
                }}
                onEndReachedThreshold={0.5}
            />
            {previewIndex !== null && (
                <PhotosPreviewModal
                    photos={photos}
                    startIndex={previewIndex}
                    isOpen={isPreviewOpen}
                    onClose={handleClosePreview}
                />
            )}
        </View>
    );
}
