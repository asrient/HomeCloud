import { AppName, PinnedFolder, SidebarItem, SidebarList } from "@/lib/types";
import useFilterStorages from "./useFilterStorages";
import { useAppState } from "./useAppState";
import { folderViewUrl, buildNextUrl, photosByStorageUrl } from "@/lib/urls";
import { iconUrl, FileType } from "@/lib/fileUtils";
import { getIconForStorage, getUrlFromIconKey } from "@/lib/storageConfig";

export type FilesSidebarData = {
    folderId?: string;
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
    const { iconKey } = useAppState();
    return [
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
        {
            title: 'Devices',
            items: storages?.map((storage) => ({
                title: storage.name,
                icon: getIconForStorage(storage, iconKey),
                href: photosByStorageUrl(storage.id),
                key: storage.id.toString(),
            })) || []
        }
    ]
}

export function useSettingsBar(): SidebarList {
    const { storages, iconKey } = useAppState();
    return [
        {
            items: [
                {
                    title: 'Profile',
                    href: buildNextUrl('/settings/profile'),
                    icon: '/icons/user.png',
                    key: 'profile',
                },
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
