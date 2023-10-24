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
