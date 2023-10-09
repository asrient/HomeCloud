import { AppName, SidebarList } from "@/lib/types";
import useFilterStorages from "./useFilterStorages";
import { useAppState } from "./useAppState";
import { join } from "path";

export function useFilesBar(): SidebarList {
    const storages = useFilterStorages(AppName.Files);
    const { pinnedFolders } = useAppState();
    return [
        {
            items: [
                {
                    title: 'My Files',
                    icon: 'folder',
                    href: '/files',
                },
                {
                    title: 'Recents',
                    icon: 'recents',
                    href: '/files/recent',
                },
            ]
        },
        {
            title: 'Favorites',
            items: pinnedFolders?.map((pinnedFolder) => ({
                title: pinnedFolder.name,
                icon: 'folder',
                href: join(`/files/s/${pinnedFolder.storageId}`, pinnedFolder.folderId),
            })) || []
        },
        {
            title: 'Storages',
            items: storages?.map((storage) => ({
                title: storage.name,
                icon: 'drive',
                href: `/files/s/${storage.id}`,
            })) || []
        }
    ]
}
