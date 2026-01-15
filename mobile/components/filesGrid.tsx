import { FileRemoteItem } from '@/lib/types';
import { ActivityIndicator, NativeSyntheticEvent, Pressable, View, ViewStyle } from 'react-native';
import { UIText } from './ui/UIText';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatFileSize, getLocalServiceController, getServiceController, printFingerprint } from '@/lib/utils';
import { FlashList } from "@shopify/flash-list";
import { ThumbnailCheckbox } from './ThumbnailCheckbox';
import { useFolder, usePinnedFolders } from '@/hooks/useFolders';
import { canGenerateThumbnail, pinnedFolderToRemoteItem, getDefautIconUri, getFolderAppRoute, getKind } from '@/lib/fileUtils';
import { RemoteItem } from 'shared/types';
import { useRouter } from 'expo-router';
import ContextMenu, { ContextMenuAction, ContextMenuOnPressNativeEvent } from 'react-native-context-menu-view';
import { UIIcon } from './ui/UIIcon';
import { getPeerIconName } from './ui/getPeerIconName';


export type FileSortBy = {
    field: 'name' | 'size' | 'dateAdded';
    direction: 'asc' | 'desc';
}

export type FileQuickActionType = {
    type: 'rename' | 'delete' | 'move' | 'info' | 'export' | 'openInDevice' | 'sendToDevice';
    targetDeviceFingerprint?: string;
    item: FileRemoteItem;
}

function isFileSelectable(item: FileRemoteItem, selectKind: 'file' | 'folder' | 'both',) {
    if (selectKind === 'both') {
        return true;
    }
    if (selectKind === 'file' && item.type !== 'directory') {
        return true;
    }
    if (selectKind === 'folder' && item.type === 'directory') {
        return true;
    }
    return false;
}

// Shared hook for file item state and logic
function useFileItemState(
    item: FileRemoteItem,
    isSelectMode: boolean | undefined,
    onPress: (item: FileRemoteItem, previewIntent?: boolean) => Promise<boolean>,
    onQuickAction: (action: FileQuickActionType) => void,
    selectKind: 'file' | 'folder' | 'both',
    disablePreview: boolean,
    isSelected?: boolean,
) {
    const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(item.thumbnail || null);
    const [isSelectedInternal, setIsSelectedInternal] = useState(isSelected || item.isSelected || false);
    const [isPressed, setIsPressed] = useState(false);

    const isDir = useMemo(() => item.type === 'directory', [item.type]);

    useEffect(() => {
        setIsSelectedInternal(isSelected || item.isSelected || false);
        setThumbnailSrc(item.thumbnail || null);
    }, [isSelected, item.isSelected, item.thumbnail]);

    const isSelectable = useMemo(() => {
        if (!isSelectMode) {
            return false;
        }
        return selectKind ? isFileSelectable(item, selectKind) : true;
    }, [isSelectMode, selectKind, item]);

    useEffect(() => {
        if (!isSelectMode || !isSelectable || !isSelected) {
            setIsSelectedInternal(false);
            item.isSelected = false;
        }
    }, [isSelectMode, isSelectable, isSelected, item]);

    const fileKind = useMemo(() => getKind(item), [item]);

    const fetchThumbnailSrc = useCallback(async (item: FileRemoteItem) => {
        if (item.thumbnail) {
            return item.thumbnail;
        }
        const serviceController = await getServiceController(item.deviceFingerprint);
        item.thumbnail = await serviceController.thumbnail.generateThumbnailURI(item.path);
        return item.thumbnail;
    }, []);

    useEffect(() => {
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

    const isPressedRef = useRef(false);

    const handlePress = useCallback(async (previewIntent?: boolean) => {
        if (isPressedRef.current) {
            return;
        }
        isPressedRef.current = true;
        setIsPressed(true);
        try {
            const canContinue = onPress ? (await onPress(item, previewIntent)) : true;
            if (!canContinue) {
                return;
            }
            if (isSelectable && !previewIntent) {
                const newSelected = !isSelectedInternal;
                item.isSelected = newSelected;
                // only update internal state if isSelected prop is not provided i.e not controlled externally
                // if extenally controlled, the state will be automatically updated via useEffect
                if (isSelected === undefined) {
                    setIsSelectedInternal(newSelected);
                }
            }
        } finally {
            isPressedRef.current = false;
            setIsPressed(false);
        }
    }, [onPress, item, isSelectable, isSelectedInternal, isSelected]);

    const actions = useMemo(() => {
        if (isSelectMode) {
            const actions_: ContextMenuAction[] = [];
            if (!disablePreview) {
                actions_.push({
                    title: isDir ? 'Open' : 'Preview',
                    systemIcon: isDir ? 'folder' : 'eye',
                });
            }
            if (isSelectable) {
                actions_.push({
                    title: isSelectedInternal ? 'Deselect' : 'Select',
                    systemIcon: isSelectedInternal ? 'checkmark.circle.fill' : 'circle',
                });
            }
            return actions_;
        }
        const localSc = getLocalServiceController();
        const peers = localSc.app.getPeers();
        let baseActions: ContextMenuAction[] = [
            { title: "Info", systemIcon: "info.circle" },
            { title: "Rename", systemIcon: "pencil" },
            { title: "Move", systemIcon: "folder" },

        ];
        if (!isDir) {
            baseActions.push({ title: "Export", systemIcon: "square.and.arrow.up" });
        }
        baseActions.push({ title: "Delete", systemIcon: "trash", destructive: true });
        if (!isDir) {
            baseActions = [
                ...baseActions,
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
            ]
        }
        return baseActions;
    }, [disablePreview, isDir, isSelectMode, isSelectable, isSelectedInternal, item.deviceFingerprint]);

    const handleQuickAction = useCallback((event: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
        if (!onQuickAction) {
            return;
        }
        const action = event.nativeEvent.name;
        const parentIndex = event.nativeEvent.indexPath.length > 1 ? event.nativeEvent.indexPath[0] : null;
        let type: FileQuickActionType['type'] | null = null;
        let targetDeviceFingerprint: string | undefined = undefined;
        switch (action) {
            case 'Open':
            case 'Preview':
                // Handled in onPress
                !disablePreview && handlePress(true);
                return;
            case 'Select':
            case 'Deselect':
                // Handled in onPress
                handlePress();
                return;
            case 'Info':
                type = 'info';
                break;
            case 'Rename':
                type = 'rename';
                break;
            case 'Move':
                type = 'move';
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
        if ((parentIndex === 6 || parentIndex === 5) && !isDir) {
            // Open in device or Send to device submenu
            const deviceName = action;
            const localSc = getLocalServiceController();
            const peer = localSc.app.getPeers().find(p => p.deviceName === deviceName);
            if (!peer) {
                console.error('Peer not found for quick action:', deviceName);
                return;
            }
            targetDeviceFingerprint = peer.fingerprint;
            if (parentIndex === 5) {
                type = 'openInDevice';
            } else if (parentIndex === 6) {
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
            item,
        });
    }, [disablePreview, handlePress, isDir, item, onQuickAction]);

    return {
        thumbnailSrc,
        isSelectedInternal,
        isPressed,
        isDir,
        handlePress,
        actions,
        fileKind,
        handleQuickAction,
        isSelectable,
    };
}

export function FileThumbnail({ item, onPress, isSelectMode, disableContextMenu, onQuickAction, selectKind, disablePreview, isSelected }: {
    item: FileRemoteItem,
    onPress: (item: FileRemoteItem, previewIntent?: boolean) => Promise<boolean>,
    isSelectMode: boolean,
    disableContextMenu: boolean,
    onQuickAction: (action: FileQuickActionType) => void;
    selectKind: 'file' | 'folder' | 'both';
    disablePreview: boolean;
    isSelected?: boolean;
}) {
    const { thumbnailSrc, isSelectedInternal, isPressed, handlePress, actions, fileKind, handleQuickAction, isSelectable } = useFileItemState(item, isSelectMode, onPress, onQuickAction, selectKind, disablePreview, isSelected);

    const handlePressWrapper = useCallback(() => {
        handlePress(false);
    }, [handlePress]);

    return (
        <ContextMenu
            // title='Meow'
            actions={actions}
            disabled={disableContextMenu}
            onPress={handleQuickAction}
            onPreviewPress={() => handlePress(true)}
        >
            <Pressable
                disabled={isPressed}
                onPress={handlePressWrapper}
                style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', margin: 2 }}>
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
                    <ThumbnailCheckbox position='top-right' isSelected={isSelectedInternal} disabled={!isSelectable} />
                }
                <UIText
                    numberOfLines={1}
                    size='sm'
                    style={{ textAlign: 'center', paddingTop: 2 }}>
                    {item.name}
                </UIText>
                <UIText
                    numberOfLines={1}
                    size="sm"
                    color="textSecondary"
                    style={{ textAlign: 'center', paddingTop: 1 }}>
                    {fileKind}
                </UIText>
            </Pressable>
        </ContextMenu>
    );
}

export function FileListItem({ item, onPress, isSelectMode, disableContextMenu, onQuickAction, selectKind, disablePreview, isSelected }:
    {
        item: FileRemoteItem,
        onPress: (item: FileRemoteItem, previewIntent?: boolean) => Promise<boolean>,
        isSelectMode: boolean,
        disableContextMenu: boolean,
        onQuickAction: (action: FileQuickActionType) => void,
        selectKind: 'file' | 'folder' | 'both';
        disablePreview: boolean;
        isSelected?: boolean;
    }) {
    const { thumbnailSrc, isSelectedInternal, isPressed, isDir, handlePress, actions, fileKind, handleQuickAction, isSelectable } = useFileItemState(item, isSelectMode, onPress, onQuickAction, selectKind, disablePreview, isSelected);
    let subText: string = fileKind;
    if (!isDir) {
        subText += `  ${formatFileSize(item.size || 0)}`;
    }

    return (
        <ContextMenu
            actions={actions}
            disabled={disableContextMenu}
            onPress={handleQuickAction}
            onPreviewPress={() => handlePress(true)}
        >
            <Pressable
                disabled={isPressed}
                onPress={() => handlePress()}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    minHeight: 60,
                    backgroundColor: isPressed ? 'rgba(0,0,0,0.1)' : 'transparent',
                }}
            >
                {isSelectMode && (
                    <View style={{ marginRight: 12 }}>
                        <ThumbnailCheckbox isSelected={isSelectedInternal} disabled={!isSelectable} />
                    </View>
                )}
                <Image
                    source={
                        thumbnailSrc ? {
                            uri: thumbnailSrc,
                            cacheKey: `${item.deviceFingerprint}-${item.path}`
                        } : getDefautIconUri(item)
                    }
                    style={{ width: 40, height: 40, borderRadius: 6 }}
                    contentFit="cover"
                />
                <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
                    <UIText numberOfLines={1} size='md'>
                        {item.name}
                    </UIText>
                    <UIText numberOfLines={1} size="sm" color="textSecondary" style={{ marginTop: 1 }}>
                        {subText}
                    </UIText>
                </View>
                {isPressed ? (
                    <ActivityIndicator size="small" style={{ marginLeft: 8 }} />
                ) : (
                    isDir && <UIIcon name="chevron.forward" size={20} themeColor="textTertiary" style={{ marginLeft: 8 }} />
                )}
            </Pressable>
        </ContextMenu>
    );
}

export type GridPropsCommon = {
    headerComponent?: React.ReactElement;
    footerComponent?: React.ReactElement;
    selectMode?: boolean;
    selectKind?: 'file' | 'folder' | 'both';
    onSelect?: (file: FileRemoteItem) => void | boolean;
    onDeselect?: (file: FileRemoteItem) => void | boolean;
    onPreview?: (file: FileRemoteItem) => void | boolean;
    disablePreview?: boolean;
    disableContextMenu?: boolean;
    viewMode?: 'grid' | 'list';
    sortBy?: FileSortBy;
    onQuickAction?: (action: FileQuickActionType) => void;
    selectedItems?: FileRemoteItem[];
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

export function FilesGrid({ items, headerComponent, footerComponent, selectMode, onSelect, onDeselect, onPreview, isLoading, error, disablePreview, viewMode = 'grid', disableContextMenu, sortBy, onQuickAction, selectKind, selectedItems }: FilesGridProps) {
    const [internalRenderKey, setInternalRenderKey] = useState(0);
    const router = useRouter();

    const sortedItems = useMemo(() => {
        if (!sortBy) {
            return items;
        }
        const sorted = [...items];
        sorted.sort((a, b) => {
            let compare = 0;
            if (sortBy.field === 'name') {
                compare = a.name.localeCompare(b.name);
            } else if (sortBy.field === 'size') {
                compare = (a.size || 0) - (b.size || 0);
            } else if (sortBy.field === 'dateAdded') {
                // compare the dates
                compare = (new Date(a.createdAt || 0)).getTime() - (new Date(b.createdAt || 0)).getTime();
            }
            return sortBy.direction === 'asc' ? compare : -compare;
        });
        return sorted;
    }, [items, sortBy]);

    useEffect(() => {
        // Force re-render when selectMode or viewMode changes to update thumbnails
        setInternalRenderKey((prev) => prev + 1);
    }, [selectMode, viewMode]);

    const previewLockRef = useRef(false);

    const previewFile = useCallback(async (file: FileRemoteItem) => {
        if (disablePreview) {
            return;
        }
        if (previewLockRef.current) {
            console.warn('Preview is locked, skipping preview for', file.path);
            return;
        }
        previewLockRef.current = true;
        try {
            const serviceController = getLocalServiceController();
            await serviceController.files.openFile(file.deviceFingerprint, file.path);
        } catch (error) {
            console.error('Error previewing file:', file.path, error);
            const localSc = getLocalServiceController();
            localSc.system.alert('Could not open file', `${(error as Error).message || 'Something went wrong.'}`);
        } finally {
            previewLockRef.current = false;
        }
    }, [disablePreview]);

    const handleFilePress = useCallback(async (file: FileRemoteItem, previewIntent?: boolean) => {
        // Handle file press based on selectMode
        console.log('File pressed:', file.path, 'selectMode:', selectMode);
        if (selectMode && isFileSelectable(file, selectKind || 'both') && !previewIntent) {
            if (!file.isSelected) {
                if (onSelect) {
                    const result = onSelect(file);
                    if (result === false) {
                        return false;
                    }
                }
            } else {
                if (onDeselect) {
                    const result = onDeselect(file);
                    if (result === false) {
                        return false;
                    }
                }
            }
        } else if (!disablePreview) {
            if (onPreview) {
                const shouldPreview = onPreview(file);
                if (shouldPreview === false) {
                    return false;
                }
            }
            if (file.type === 'directory') {
                // Navigate to folder view
                router.push(getFolderAppRoute(file.path, file.deviceFingerprint));
            } else {
                await previewFile(file);
            }
        }
        return true;
    }, [selectMode, selectKind, disablePreview, onSelect, onDeselect, onPreview, router, previewFile]);

    const handleQuickAction = useCallback((action: FileQuickActionType) => {
        if (onQuickAction) {
            onQuickAction(action);
        }
    }, [onQuickAction]);

    const renderItem = useCallback(({ item }: { item: FileRemoteItem }) => {
        const isSelected = selectedItems ? selectedItems.some(si => si.path === item.path && si.deviceFingerprint === item.deviceFingerprint) : undefined;
        if (viewMode === 'grid') {
            return (
                <View style={{ flex: 1 / 3, aspectRatio: 1, margin: 1 }}>
                    <FileThumbnail
                        item={item}
                        isSelectMode={selectMode || false}
                        isSelected={isSelected}
                        onPress={handleFilePress}
                        disableContextMenu={disableContextMenu || false}
                        onQuickAction={handleQuickAction}
                        selectKind={selectKind || 'both'}
                        disablePreview={disablePreview || false}
                    />
                </View>
            );
        }
        return (
            <FileListItem
                item={item}
                isSelectMode={selectMode || false}
                isSelected={isSelected}
                onPress={handleFilePress}
                disableContextMenu={disableContextMenu || false}
                onQuickAction={handleQuickAction}
                selectKind={selectKind || 'both'}
                disablePreview={disablePreview || false}
            />
        );
    }, [disableContextMenu, disablePreview, handleFilePress, handleQuickAction, selectKind, selectMode, selectedItems, viewMode]);

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
                data={sortedItems}
                extraData={internalRenderKey}
                keyExtractor={(item) => item.deviceFingerprint ? printFingerprint(item.deviceFingerprint) + '|' + item.path : item.path}
                numColumns={viewMode === 'grid' ? 3 : 1}
                key={viewMode} // Force remount when switching between grid and list
                refreshing={isLoading}
                renderItem={renderItem}
                ListEmptyComponent={
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                        <UIText>Its empty here</UIText>
                    </View>
                }
            />
        </View>
    );
}

export function FolderFilesGrid({ deviceFingerprint, path, footerComponent, showPageFooter, pageFooterStyle, ...rest }: FolderFilesGridProps) {

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
            footerComponent={
                footerComponent || (
                    showPageFooter ?
                        <View style={{ paddingHorizontal: 10, paddingVertical: 30, justifyContent: 'center', alignItems: 'center', ...pageFooterStyle }}>
                            <UIText size="sm" color='textSecondary'>
                                {`${remoteItems.length} items.`}
                            </UIText>
                        </View>
                        : undefined
                )
            }
            {...rest}
        />
    );
}

export function PinnedFoldersGrid({ deviceFingerprint, hideEmpty, ...rest }: PinnedFoldersGridProps) {
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
            {...rest}
        />
    );
}
