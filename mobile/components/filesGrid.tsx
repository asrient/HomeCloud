import { FileRemoteItem } from '@/lib/types';
import { ActivityIndicator, Pressable, View, ViewStyle } from 'react-native';
import { UIText } from './ui/UIText';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServiceController, printFingerprint } from '@/lib/utils';
import { FlashList } from "@shopify/flash-list";
import { ThumbnailCheckbox } from './ThumbnailCheckbox';
import { useFolder, usePinnedFolders } from '@/hooks/useFolders';
import { canGenerateThumbnail, pinnedFolderToRemoteItem, getDefautIconUri, getFolderAppRoute } from '@/lib/fileUtils';
import { RemoteItem } from 'shared/types';
import { useRouter } from 'expo-router';


export function FileThumbnail({ item, onPress, isSelectMode }: { item: FileRemoteItem, onPress?: (item: FileRemoteItem) => void, isSelectMode?: boolean }) {
    const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(item.thumbnail || null);
    const [isSelected, setIsSelected] = useState(item.isSelected || false);

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

    const fetchThumbnailSrc = useCallback(async (item: FileRemoteItem) => {
        if (item.thumbnail) {
            return item.thumbnail;
        }
        const serviceController = await getServiceController(item.deviceFingerprint);
        item.thumbnail = await serviceController.thumbnail.generateThumbnailURI(item.path);
        return item.thumbnail;
    }, []);

    useEffect(() => {
        // console.log('Fetching thumbnail for photo', item.id);
        if (!canGenerateThumbnail(item)) {
            return;
        }
        fetchThumbnailSrc(item)
            .then((src) => {
                setThumbnailSrc(src || null);
            })
            .catch((err) => {
                console.error('Error fetching thumbnail for photo', item.path, err);
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

    return (
        <Pressable onPress={handlePress} style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', margin: 2 }}>
            <Image
                source={
                    thumbnailSrc ? {
                        uri: thumbnailSrc,
                        cacheKey: `${item.deviceFingerprint}-${item.path}`
                    } : getDefautIconUri(item)
                }
                style={{ width: '60%', height: '60%' }}
                contentFit="contain"
            />
            {
                isSelectMode &&
                <ThumbnailCheckbox isSelected={isSelected} />
            }
            <UIText
                numberOfLines={1}
                style={{ textAlign: 'center', paddingTop: 2, fontSize: 14 }}>
                {item.name}
            </UIText>
        </Pressable>
    );
}

export type GridPropsCommon = {
    headerComponent?: React.ReactElement;
    footerComponent?: React.ReactElement;
    selectMode?: boolean;
    onSelect?: (file: FileRemoteItem) => void;
    onDeselect?: (file: FileRemoteItem) => void;
    onPreview?: (file: FileRemoteItem) => void;
}

export type FilesGridProps = GridPropsCommon & {
    items: FileRemoteItem[];
    isLoading: boolean;
    error: string | null;
}

export type FolderFilesGridProps = GridPropsCommon & {
    deviceFingerprint: string | null;
    path: string;
    showPageFooter?: boolean;
    pageFooterStyle?: ViewStyle;
}

export type PinnedFoldersGridProps = GridPropsCommon & {
    deviceFingerprint: string | null;
    hideEmpty?: boolean;
}

export function FilesGrid({ items, headerComponent, footerComponent, selectMode, onSelect, onDeselect, onPreview, isLoading, error }: FilesGridProps) {
    const [renderKey, setRenderKey] = useState(0);
    const router = useRouter();

    useEffect(() => {
        // Force re-render when selectMode changes to update thumbnails
        console.log('Select mode changed:', selectMode);
        setRenderKey((prev) => prev + 1);
    }, [selectMode]);

    const handleFilePress = useCallback((file: FileRemoteItem) => {
        // Handle file press based on selectMode
        console.log('File pressed:', file.path, 'selectMode:', selectMode);
        if (selectMode) {
            if (file.isSelected) {
                onSelect && onSelect(file);
            } else {
                onDeselect && onDeselect(file);
            }
        } else {
            if (file.type === 'directory') {
                // Navigate to folder view
                router.push(getFolderAppRoute(file.path, file.deviceFingerprint));
            } else {
                onPreview && onPreview(file);
            }
        }
    }, [selectMode, onSelect, onDeselect, router, onPreview]);

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (error) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <UIText>Error loading files: {error}</UIText>
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <FlashList
                ListHeaderComponent={headerComponent}
                ListFooterComponent={footerComponent}
                data={items}
                extraData={renderKey}
                keyExtractor={(item) => item.deviceFingerprint ? printFingerprint(item.deviceFingerprint) + '|' + item.path : item.path}
                numColumns={3}
                refreshing={isLoading}
                renderItem={({ item }) => (
                    <View style={{ flex: 1 / 3, aspectRatio: 1, margin: 1 }}>
                        <FileThumbnail item={item} isSelectMode={selectMode} onPress={handleFilePress} />
                    </View>
                )}
                ListEmptyComponent={
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                        <UIText>Its empty here</UIText>
                    </View>
                }
            />
        </View>
    );
}

export function FolderFilesGrid({ deviceFingerprint, path, headerComponent, footerComponent, selectMode, onSelect, onDeselect, onPreview, showPageFooter, pageFooterStyle }: FolderFilesGridProps) {

    const mapper = useCallback((item: RemoteItem): FileRemoteItem => ({
        ...item,
        isSelected: false,
        deviceFingerprint: deviceFingerprint,
    }), [deviceFingerprint]);

    const { remoteItems, isLoading, error } = useFolder<FileRemoteItem>(deviceFingerprint, path, mapper);

    console.log(`Loaded ${remoteItems.length} items for folder ${path}`);

    return (
        <FilesGrid
            items={remoteItems}
            isLoading={isLoading}
            error={error}
            headerComponent={headerComponent}
            selectMode={selectMode}
            onSelect={onSelect}
            onDeselect={onDeselect}
            onPreview={onPreview}
            footerComponent={
                footerComponent || (
                    showPageFooter ?
                        <View style={{ paddingHorizontal: 10, paddingVertical: 30, justifyContent: 'center', alignItems: 'center', ...pageFooterStyle }}>
                            <UIText type="sm" style={{ color: 'gray' }}>
                                {`${remoteItems.length} items.`}
                            </UIText>
                        </View>
                        : undefined
                )
            }
        />
    );
}

export function PinnedFoldersGrid({ deviceFingerprint, headerComponent, footerComponent, selectMode, onSelect, onDeselect, onPreview, hideEmpty }: PinnedFoldersGridProps) {
    const { pinnedFolders, isLoading, error } = usePinnedFolders(deviceFingerprint);

    const items: FileRemoteItem[] = useMemo(() => pinnedFolders.map((folder) => pinnedFolderToRemoteItem(folder, deviceFingerprint)).map((remoteItem) => ({
        ...remoteItem,
        isSelected: false,
    })), [pinnedFolders, deviceFingerprint]);

    if (hideEmpty && items.length === 0) {
        return null;
    }

    return (
        <FilesGrid
            items={items}
            isLoading={isLoading}
            error={error}
            headerComponent={headerComponent}
            footerComponent={footerComponent}
            selectMode={selectMode}
            onSelect={onSelect}
            onDeselect={onDeselect}
            onPreview={onPreview}
        />
    );
}
