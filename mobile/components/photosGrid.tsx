import { PhotosFetchOptions, PhotoView } from '@/lib/types';
import { usePhotos } from '@/hooks/usePhotos';
import { ActivityIndicator, NativeSyntheticEvent, Pressable, View } from 'react-native';
import { UIText } from './ui/UIText';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLocalServiceController, getServiceController } from '@/lib/utils';
import { FlashList } from "@shopify/flash-list";
import { ThumbnailCheckbox } from './ThumbnailCheckbox';
import { PhotosPreviewModal } from './photosPreviewModal';
import ContextMenu, { ContextMenuOnPressNativeEvent } from "react-native-context-menu-view";
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

    const handleQuickAction = useCallback((event: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
        if (!onQuickAction) {
            return;
        }
        const action = event.nativeEvent.name;
        const parentIndex = event.nativeEvent.indexPath.length > 1 ? event.nativeEvent.indexPath[0] : null;
        let type: PhotosQuickAction['type'] | null = null;
        let targetDeviceFingerprint: string | undefined = undefined;
        switch (action) {
            case 'Info':
                type = 'info';
                break;
            case 'Delete':
                type = 'delete';
                break;
            case 'Export':
                type = 'export';
                break;
            default:
                type = null;
        }
        // 1: Open in device submenu, 2: Send to device submenu
        if ((parentIndex === 1 || parentIndex === 2)) {
            // Open in device or Send to device submenu
            const deviceName = action;
            const localSc = getLocalServiceController();
            const peer = localSc.app.getPeers().find(p => p.deviceName === deviceName);
            if (!peer) {
                console.error('Peer not found for quick action:', deviceName);
                return;
            }
            targetDeviceFingerprint = peer.fingerprint;
            if (parentIndex === 1) {
                type = 'openInDevice';
            } else if (parentIndex === 2) {
                type = 'sendToDevice';
            }
        }
        if (!type) {
            console.error('Unknown quick action type for action:', action);
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
        <ContextMenu
            style={{ width: '100%', height: '100%' }}
            // title='Meow'
            actions={[
                { title: "Export", systemIcon: "square.and.arrow.up" },
                {
                    title: "Open in device",
                    systemIcon: "macbook.and.iphone",
                    actions: peers.filter(peer => peer.fingerprint !== modules.config.FINGERPRINT).map((peer) => ({
                        title: peer.deviceName,
                        systemIcon: getPeerIconName(peer),
                    })),
                },
                {
                    title: "Send to device",
                    systemIcon: "arrow.up.message",
                    actions: peers.filter(peer => peer.fingerprint !== item.deviceFingerprint).map((peer) => ({
                        title: peer.deviceName,
                        systemIcon: getPeerIconName(peer),
                    })),
                },
                { title: "Info", systemIcon: "info.circle" },
                { title: "Delete", systemIcon: "trash", destructive: true },
            ]}
            onPress={handleQuickAction}
            onPreviewPress={handlePress}
        >
            <Pressable onPress={handlePress} style={{ width: '100%', height: '100%' }}>
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
        </ContextMenu>
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
