import { AppName, SidebarList } from "@/lib/types";
import useFilterStorages from "./useFilterStorages";
import { useAppState } from "./useAppState";
import { folderViewUrl, buildNextUrl, photosByStorageUrl } from "@/lib/urls";
import { iconUrl, FileType } from "@/lib/fileUtils";

export type FilesSidebarData = {
    folderId?: string;
    storageId: number;
}

export function useFilesBar(): SidebarList {
    const storages = useFilterStorages(AppName.Files);
    const { pinnedFolders } = useAppState();
    return [
        {
            items: [
                {
                    title: 'My Files',
                    href: buildNextUrl('/files'),
                    icon: '/icons/home.png',
                    key: 'home',
                },
            ]
        },
        {
            title: 'Favorites',
            items: pinnedFolders?.map((pinnedFolder) => ({
                title: pinnedFolder.name,
                icon: iconUrl(FileType.Folder),
                href: folderViewUrl(pinnedFolder.storageId, pinnedFolder.folderId),
                key: pinnedFolder.folderId + pinnedFolder.storageId,
                rightClickable: true,
                data: {
                    folderId: pinnedFolder.folderId,
                    storageId: pinnedFolder.storageId,
                } as FilesSidebarData,
            })) || []
        },
        {
            title: 'Storages',
            items: storages?.map((storage) => ({
                title: storage.name,
                icon: iconUrl(FileType.Drive),
                href: folderViewUrl(storage.id),
                key: storage.id.toString(),
                data: {
                    storageId: storage.id,
                } as FilesSidebarData,
            })) || []
        }
    ]
}

export function usePhotosBar(): SidebarList {
    const storages = useFilterStorages(AppName.Photos);
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
                    icon: '/icons/recents.png',
                    key: 'recents',
                },
            ]
        },
        {
            title: 'Locations',
            items: storages?.map((storage) => ({
                title: storage.name,
                icon: iconUrl(FileType.Drive),
                href: photosByStorageUrl(storage.id),
                key: storage.id.toString(),
            })) || []
        }
    ]
}

export function useSettingsBar(): SidebarList {
    const { storages } = useAppState();
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
                icon: iconUrl(FileType.Drive),
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
