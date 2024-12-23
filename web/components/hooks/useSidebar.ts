import { AppName, PhotoLibrary, PinnedFolder, SidebarItem, SidebarList } from "@/lib/types";
import useFilterStorages from "./useFilterStorages";
import { useAppState } from "./useAppState";
import { folderViewUrl, buildNextUrl, photosLibraryUrl } from "@/lib/urls";
import { iconUrl, FileType } from "@/lib/fileUtils";
import { getIconForStorage, getUrlFromIconKey } from "@/lib/storageConfig";

export type FilesSidebarData = {
    folderId?: string;
    storageId: number;
}

export type PhotosSidebarData = {
    libraryId: number;
    storageId: number;
}

export function useFilesBar(): SidebarList {
    const storages = useFilterStorages(AppName.Files);
    const { pinnedFolders, disks } = useAppState();
    const list: SidebarList = [
        {
            items: [
                {
                    title: 'My Files',
                    href: buildNextUrl('/files'),
                    icon: '/icons/stack.png',
                    key: 'home',
                },
            ]
        },
    ]

    storages?.forEach((storage) => {
        const pins: PinnedFolder[] = pinnedFolders ? (pinnedFolders[storage.id] || []) : [];
        const disks_ = disks ? (disks[storage.id] || []) : [];
        const items: SidebarItem[] = [];
        pins.forEach((pin) => {
            items.push({
                title: pin.name,
                icon: iconUrl(FileType.Folder),
                href: folderViewUrl(storage.id, pin.folderId),
                key: pin.id.toString(),
                rightClickable: true,
                data: {
                    folderId: pin.folderId,
                    storageId: storage.id,
                } as FilesSidebarData,
            });
        });
        disks_.forEach((disk) => {
            items.push({
                title: disk.name,
                icon: iconUrl(FileType.Drive),
                href: folderViewUrl(storage.id, disk.id),
                key: disk.id,
                data: {
                    folderId: disk.id,
                    storageId: storage.id,
                } as FilesSidebarData,
            });
        });
        list.push({
            title: storage.name,
            items,
        });
    });
    return list;
}

export function usePhotosBar(): SidebarList {
    const storages = useFilterStorages(AppName.Photos);
    const { photoLibraries } = useAppState();
    const list: SidebarList = [
        {
            title: 'Library',
            items: [
                {
                    title: 'All Photos',
                    href: buildNextUrl('/photos'),
                    icon: '/icons/photos.png',
                    key: 'home',
                },
                {
                    title: 'Recently Added',
                    href: buildNextUrl('/photos/recents'),
                    icon: '/icons/clock.png',
                    key: 'recents',
                },
            ]
        },
    ]

    storages?.forEach((storage) => {
        const libs: PhotoLibrary[] = photoLibraries ? (photoLibraries[storage.id] || []) : [];
        const items: SidebarItem[] = [];
        libs.forEach((lib) => {
            items.push({
                title: lib.name,
                icon: iconUrl(FileType.Folder),
                href: photosLibraryUrl(storage.id, lib.id),
                key: `${storage.id}-${lib.id}`,
                rightClickable: true,
                data: {
                    libraryId: lib.id,
                    storageId: storage.id,
                } as PhotosSidebarData,
            });
        });
        list.push({
            title: storage.name,
            items,
        });
    });
    return list;
}

export function useSettingsBar(): SidebarList {
    const { storages, iconKey } = useAppState();
    return [
        {
            items: [
                {
                    title: 'General',
                    href: buildNextUrl('/settings/general'),
                    icon: '/icons/settings.png',
                    key: 'general',
                },
            ]
        },
        {
            title: 'Storages',
            items: [...(storages?.map((storage) => ({
                title: storage.name,
                icon: getIconForStorage(storage, iconKey),
                href: buildNextUrl('/settings/storage', { id: storage.id.toString() }),
                key: storage.id.toString(),
            })) || []),
            {
                title: 'Add new',
                icon: '/icons/add.png',
                key: 'add-storage',
            },
            ]
        },
    ]
}
