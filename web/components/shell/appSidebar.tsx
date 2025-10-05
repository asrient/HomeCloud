import { SidebarSectionView, SidebarView } from "./sidebarPrimatives";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCallback, useMemo, useState } from "react";
import { SidebarItem, SidebarSection } from "@/lib/types";
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

    const { remoteItems: disks } = useFolder(fingerprint, '');
    const { pinnedFolders } = usePinnedFolders(fingerprint);
    const [selectedSidebarItem, setSelectedSidebarItem] = useState<SidebarItem | null>(null);
    const router = useRouter();

    const openItem = useCallback(() => {
        console.log('Opening item:', selectedSidebarItem);
        if (!selectedSidebarItem) return;
        router.push(selectedSidebarItem.href || '/files');
    }, [selectedSidebarItem, router]);

    const removePinnedFolder = useCallback(async () => {
        if (!selectedSidebarItem || !selectedSidebarItem.data) return;
        const { deviceFingerprint, path } = (selectedSidebarItem.data as FilesSidebarData);
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
            alert(`Could not remove from "${selectedSidebarItem.title}" favourites.`);
        }
    }, [fingerprint, selectedSidebarItem]);

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
            items
        };
    }, [disks, fingerprint, pinnedFolders]);

    const folderPath = (selectedSidebarItem?.data as FilesSidebarData)?.path;

    return (<div>
        <ContextMenu>
            <ContextMenuTrigger>
                <SidebarSectionView onRightClick={setSelectedSidebarItem} section={section} />
            </ContextMenuTrigger>
            <ContextMenuContent>
                {folderPath && (
                    <>
                        <ContextMenuItem onClick={openItem}>
                            Open
                        </ContextMenuItem>
                        <ContextMenuItem>
                            Get info
                        </ContextMenuItem>
                        <ContextMenuItem onClick={removePinnedFolder} className='text-red-500'>
                            Remove
                        </ContextMenuItem>
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>
    </div>);
}

const PhotosSection = ({
    fingerprint
}: {
    fingerprint: string | null
}) => {
    const { photoLibraries } = usePhotoLibraries(fingerprint);

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
            items
        };
    }, [photoLibraries, fingerprint]);

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
