import { View, Modal, Pressable, ScrollView } from 'react-native';
import { UIView } from '@/components/ui/UIView';
import { UIText } from '@/components/ui/UIText';
import { UIStatusBar } from '@/components/ui/UIStatusBar';
import { FileRemoteItem, RemoteItemWithPeer } from '@/lib/types';
import { FolderFilesGrid } from '@/components/filesGrid';
import { useAppState } from '@/hooks/useAppState';
import { getDeviceIconName } from './ui/getPeerIconName';
import { UIIcon } from './ui/UIIcon';
import DeviceIcon from './deviceIcon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UIButton } from './ui/UIButton';
import { useThemeColor } from '@/hooks/useThemeColor';

export type FilePickerProps = {
    selectedFingerprint?: string | null;
    defaultPath?: string;
    pickerType?: 'file' | 'folder';
    selectMultiple?: boolean;
    title?: string;
    isOpen: boolean;
    onDone: (items: RemoteItemWithPeer[] | null) => void;
}

function DeviceList({ selectDevice }: { selectDevice: (fingerprint: string | null) => void }) {
    const { peers, deviceInfo } = useAppState();
    const themeBorderColor = useThemeColor({}, 'seperator');
    return (
        <View>
            {[null, ...peers].map((peer) => {
                const fingerprint = peer ? peer.fingerprint : null;
                const name = peer ? peer.deviceName : 'This Device';
                return (<Pressable
                    key={fingerprint || 'this-device'}
                    onPress={() => selectDevice(fingerprint)}
                    style={{
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        borderBottomColor: themeBorderColor,
                        borderBottomWidth: 0.5
                    }}
                >
                    <DeviceIcon size={30} iconKey={peer ? getDeviceIconName(peer.deviceInfo) : getDeviceIconName(deviceInfo)} />
                    <UIText size="md">{name}</UIText>
                    <View style={{ flex: 1 }} />
                    <UIIcon name="chevron.forward" size={18} themeColor="textTertiary" />
                </Pressable>)
            })}
        </View>
    );
}

function DeviceListPage({ onSelect }: { onSelect: (fingerprint: string | null) => void }) {
    return (
        <View style={{ flex: 1 }}>
            <UIText style={{ padding: 8 }} size='md' font='semibold'>My Devices</UIText>
            <ScrollView>
                <View style={{ paddingHorizontal: 4 }}>
                    <DeviceList selectDevice={onSelect} />
                </View>
            </ScrollView>
        </View>
    );
}

function getParentPath(path: string): string {
    if (!path || path === '/' || path === '') return '';
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return parts.length > 0 ? '/' + parts.join('/') : '';
}

function getPathName(path: string): string {
    if (!path || path === '/' || path === '') return 'Root';
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'Root';
}

export function FilePickerModal({ isOpen, onDone, selectedFingerprint, defaultPath, pickerType = 'file', selectMultiple = false, title }: FilePickerProps) {
    const [currentPath, setCurrentPath] = useState<string>(defaultPath || '');
    const [currentFingerprint, setCurrentFingerprint] = useState<string | null | undefined>(selectedFingerprint);
    const [selectedItems, setSelectedItems] = useState<FileRemoteItem[]>([]);
    const { peers } = useAppState();

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setCurrentPath(defaultPath || '');
            setCurrentFingerprint(selectedFingerprint);
            setSelectedItems([]);
        }
    }, [isOpen, defaultPath, selectedFingerprint]);

    // Reset path when fingerprint changes
    useEffect(() => {
        setCurrentPath('');
    }, [currentFingerprint]);

    // Get current device name for header
    const currentDeviceName = useMemo(() => {
        if (currentFingerprint === null) return 'This Device';
        const peer = peers.find(p => p.fingerprint === currentFingerprint);
        return peer?.deviceName || 'Unknown Device';
    }, [currentFingerprint, peers]);

    // Handle back navigation
    const handleBack = useCallback(() => {
        if (currentPath) {
            // Go to parent folder
            setCurrentPath(getParentPath(currentPath));
        } else if (currentFingerprint !== undefined) {
            // Go back to device list
            setCurrentFingerprint(undefined as any);
        }
    }, [currentPath, currentFingerprint]);

    // Check if we can go back
    const canGoBack = currentFingerprint !== undefined || currentPath !== '';

    const isItemSelectable = useCallback((item: FileRemoteItem) => {
        if (pickerType === 'file') {
            return item.type !== 'directory';
        } else if (pickerType === 'folder') {
            return item.type === 'directory';
        }
        return false;
    }, [pickerType]);

    // Handle file/folder selection
    const handleSelect = useCallback((item: FileRemoteItem) => {
        if (!isItemSelectable(item)) return false;
        if (selectMultiple) {
            setSelectedItems(prev => {
                const exists = prev.some(i => i.path === item.path && i.deviceFingerprint === item.deviceFingerprint);
                if (exists) {
                    return prev.filter(i => !(i.path === item.path && i.deviceFingerprint === item.deviceFingerprint));
                }
                return [...prev, item];
            });
        } else {
            // Single selection - immediately select
            setSelectedItems([item]);
        }
        return true;
    }, [isItemSelectable, selectMultiple]);

    const handleDeselect = useCallback((item: FileRemoteItem) => {
        setSelectedItems(prev =>
            prev.filter(i => !(i.path === item.path && i.deviceFingerprint === item.deviceFingerprint))
        );
    }, []);

    // Handle folder navigation
    const handlePreview = useCallback((item: FileRemoteItem): boolean => {
        if (item.type === 'directory') {
            // Navigate into folder for file picker
            setCurrentPath(item.path);
            setSelectedItems([]); // Clear selection on navigation
        }
        return false; // Prevent default preview behavior
    }, []);

    // Handle done button
    const handleDone = useCallback(() => {
        if (selectedItems.length > 0) {
            onDone(selectedItems);
        } else if (pickerType === 'folder' && currentFingerprint !== undefined) {
            // If folder picker with no selection, use current folder
            onDone([{
                name: getPathName(currentPath),
                path: currentPath || '',
                type: 'directory',
                deviceFingerprint: currentFingerprint,
            } as RemoteItemWithPeer]);
        } else {
            onDone(null);
        }
    }, [selectedItems, onDone, pickerType, currentFingerprint, currentPath]);

    // Determine header title
    const headerTitle = useMemo(() => {
        if (title) return title;
        if (currentFingerprint === undefined) return 'Select Device';
        if (currentPath) return getPathName(currentPath);
        return currentDeviceName;
    }, [title, currentFingerprint, currentPath, currentDeviceName]);

    // Show device list or folder contents
    const showDeviceList = currentFingerprint === undefined;

    const seperatorColor = useThemeColor({}, 'seperator');

    return (
        <Modal
            animationType="slide"
            presentationStyle='pageSheet'
            transparent={false}
            visible={isOpen}
            onRequestClose={() => onDone(null)}
        >
            <UIStatusBar type="sheet" />
            <UIView themeColor='backgroundSecondary' style={{ flex: 1 }}>
                {/* Header */}
                <View style={{
                    paddingHorizontal: 6,
                    paddingVertical: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <View style={{ width: 70, alignItems: 'flex-start' }}>
                        {canGoBack ? (
                            <UIButton
                                icon='chevron.left'
                                size='lg'
                                type='secondary'
                                onPress={handleBack}
                            />
                        ) : (
                            <UIButton
                                icon='xmark'
                                size='lg'
                                type='secondary'
                                onPress={() => onDone(null)}
                            />
                        )}
                    </View>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <UIText size='md' font='medium' numberOfLines={1}>
                            {headerTitle}
                        </UIText>
                        {currentFingerprint !== undefined && currentPath && (
                            <UIText size='sm' color='textSecondary' numberOfLines={1}>
                                {currentDeviceName}
                            </UIText>
                        )}
                    </View>
                    <View style={{ width: 70, alignItems: 'flex-end' }}>
                        {canGoBack && (
                            <UIButton
                                icon='xmark'
                                size='lg'
                                type='secondary'
                                onPress={() => onDone(null)}
                            />
                        )}
                    </View>
                </View>

                {/* Content */}
                <View style={{ flex: 1 }}>
                    {showDeviceList ? (
                        <DeviceListPage onSelect={setCurrentFingerprint} />
                    ) : (
                        <FolderFilesGrid
                            deviceFingerprint={currentFingerprint}
                            path={currentPath}
                            selectMode={true}
                            selectKind={pickerType === 'folder' ? 'folder' : 'file'}
                            onSelect={handleSelect}
                            onDeselect={handleDeselect}
                            onPreview={handlePreview}
                            viewMode="list"
                            showPageFooter={false}
                            selectedItems={selectedItems}
                        />
                    )}
                </View>

                {/* Footer with selection info and done button */}
                {currentFingerprint !== undefined && (
                    <View style={{
                        padding: 16,
                        paddingBottom: 20,
                        borderTopWidth: 0.5,
                        borderTopColor: seperatorColor,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12
                    }}>
                        <View style={{ flex: 1 }}>
                            {selectedItems.length > 0 ? (
                                <UIText size='sm' color='textSecondary'>
                                    {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'} selected
                                </UIText>
                            ) : pickerType === 'folder' ? (
                                <UIText size='sm' color='textSecondary'>
                                    Select a folder.
                                </UIText>
                            ) : (
                                <UIText size='sm' color='textSecondary'>
                                    Tap a file to select.
                                </UIText>
                            )}
                        </View>
                        <UIButton
                            title={pickerType === 'folder' && selectedItems.length === 0 ? 'Select This Folder' : 'Done'}
                            type='primary'
                            onPress={handleDone}
                        />
                    </View>
                )}
            </UIView>
        </Modal>
    );
}
