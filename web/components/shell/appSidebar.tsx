import { SidebarSectionView, SidebarView } from "./sidebarPrimatives";
import { NativeContextMenu } from "@/components/nativeContextMenu";
import { ContextMenuItem, SidebarItem, SidebarSection } from "@/lib/types";
import { useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { useAppState } from "../hooks/useAppState";
import { useFolder, usePinnedFolders } from "../hooks/useFolders";
import { getDefaultIcon, pinnedFolderToRemoteItem } from "@/lib/fileUtils";
import { buildNextUrl, folderViewUrl } from "@/lib/urls";
import { getServiceController } from "@/lib/utils";
import { usePhotoLibraries } from "../hooks/usePhotos";
import { photosLibraryUrl } from "@/lib/urls";
import { ThemedIconName } from "@/lib/enums";
import { RemoteItem } from "shared/types";

type FilesSidebarData = {
    path?: string;
    deviceFingerprint: string | null;
}

type FileItem = RemoteItem & {
    themedIcon: ThemedIconName;
}

const FilesSection = ({
    fingerprint
}: {
    fingerprint: string | null
}) => {

    const { remoteItems: disks, isLoading, error } = useFolder(fingerprint, '');
    const { pinnedFolders, isLoading: isPinnedFoldersLoading, error: pinnedFoldersError } = usePinnedFolders(fingerprint);
    const router = useRouter();

    const section = useMemo((): SidebarSection => {
        const pinnedRemoteItems = pinnedFolders.map((pinned) => {
            return { ...pinnedFolderToRemoteItem(pinned, fingerprint), themedIcon: ThemedIconName.Folder };
        });
        const diskItems = disks.map(disk => ({
            ...disk,
            themedIcon: ThemedIconName.Disk,
        }));
        const fileItems: FileItem[] = [...pinnedRemoteItems, ...diskItems];
        const items: SidebarItem[] = [];
        fileItems.forEach((disk) => {
            const sidebarData: FilesSidebarData = {
                path: disk.path,
                deviceFingerprint: fingerprint
            };
            items.push({
                title: disk.name,
                icon: disk.themedIcon,
                href: folderViewUrl(fingerprint, disk.path),
                key: disk.path,
                data: sidebarData,
                rightClickable: true,
            });
        });
        return {
            title: 'Files',
            items,
            isRefreshing: isLoading || isPinnedFoldersLoading || !!error || !!pinnedFoldersError,
        };
    }, [disks, error, fingerprint, isLoading, isPinnedFoldersLoading, pinnedFolders, pinnedFoldersError]);

    // Use a ref to track the currently right-clicked item to avoid stale closure issues
    const rightClickedItemRef = useRef<SidebarItem | null>(null);

    const openItemDirect = useCallback((item: SidebarItem) => {
        console.log('Opening item:', item);
        router.push(item.href || '/files');
    }, [router]);

    const removePinnedFolderDirect = useCallback(async (item: SidebarItem) => {
        if (!item || !item.data) return;
        const { deviceFingerprint, path } = (item.data as FilesSidebarData);
        if (!deviceFingerprint || !path) return;
        if (deviceFingerprint !== fingerprint) {
            console.warn('Selected item does not belong to the current peer');
            return;
        }
        try {
            const serviceController = await getServiceController(fingerprint);
            await serviceController.files.removePinnedFolder(path);
        } catch (e: any) {
            console.error(e);
            alert(`Could not remove "${item.title}" from favourites.`);
        }
    }, [fingerprint]);

    const handleContextMenuClick = useCallback((id: string) => {
        const item = rightClickedItemRef.current;
        if (!item) return;
        
        switch (id) {
            case 'open':
                openItemDirect(item);
                break;
            case 'getInfo':
                // TODO: implement get info
                break;
            case 'remove':
                removePinnedFolderDirect(item);
                break;
        }
    }, [openItemDirect, removePinnedFolderDirect]);

    const handleSidebarRightClick = useCallback((item: SidebarItem | null) => {
        rightClickedItemRef.current = item;
    }, []);

    const getContextMenuItems = useCallback((): ContextMenuItem[] | undefined => {
        const item = rightClickedItemRef.current;
        if (!item) return undefined;
        const folderPath = (item.data as FilesSidebarData)?.path;
        if (!folderPath) return undefined;
        return [
            { id: 'open', label: 'Open' },
            { id: 'getInfo', label: 'Get info' },
            { id: 'remove', label: 'Remove' },
        ];
    }, []);

    return (<div>
        <NativeContextMenu
            onMenuOpen={getContextMenuItems}
            onMenuItemClick={handleContextMenuClick}
        >
            {
                section.items.length > 0 && (
                    <SidebarSectionView onRightClick={handleSidebarRightClick} section={section} />
                )
            }
        </NativeContextMenu>
    </div>);
}

const PhotosSection = ({
    fingerprint
}: {
    fingerprint: string | null
}) => {
    const { photoLibraries, isLoading, error } = usePhotoLibraries(fingerprint);

    const section = useMemo((): SidebarSection => {
        const items: SidebarItem[] = [];
        photoLibraries.forEach((library) => {
            items.push({
                title: library.name,
                icon: ThemedIconName.Photos,
                href: photosLibraryUrl(fingerprint, library.id),
                key: library.id,
                rightClickable: false,
            });
        });
        return {
            title: 'Photos',
            items,
            isRefreshing: isLoading || !!error,
        };
    }, [photoLibraries, isLoading, error, fingerprint]);

    if (photoLibraries.length === 0) {
        return null;
    }

    return (<SidebarSectionView section={section} />);
}

export function SettingsSection() {
    const section: SidebarSection = {
        items: [
            {
                title: 'Settings',
                href: buildNextUrl('/settings'),
                icon: ThemedIconName.Settings,
                key: 'settings',
            },
        ]
    }
    return (
        <SidebarSectionView section={section} />
    );
}

export function DevSection() {
    const section: SidebarSection = {
        title: 'Develop',
        items: [
            {
                title: 'Config',
                href: buildNextUrl('/dev'),
                icon: ThemedIconName.Tool,
                key: 'info',
            },
            {
                title: 'Services',
                href: buildNextUrl('/dev/playground'),
                icon: ThemedIconName.Tool,
                key: 'playground',
            },
        ]
    }
    return (
        <SidebarSectionView section={section} />
    );
}

export function AppSidebar() {
    const { selectedFingerprint } = useAppState();
    const isDev = useMemo(() => {
        return window.modules.config.IS_DEV;
    }, [])

    return (
        <SidebarView>
            <SidebarSectionView
                section={
                    {
                        items: [{
                            title: 'Home',
                            icon: ThemedIconName.Home,
                            href: buildNextUrl('/'),
                            key: 'home'
                        }]
                    }
                } />

            <PhotosSection fingerprint={selectedFingerprint} />
            <FilesSection fingerprint={selectedFingerprint} />
            {isDev && <DevSection />}
            <SettingsSection />
        </SidebarView>
    )
}
