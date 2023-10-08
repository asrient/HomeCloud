import { SidebarList } from "@/lib/types";
import { useAppState } from "./useAppState";

export function useFilesBar(): SidebarList {
    const { storages } = useAppState();

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
            items: [
                { title: 'Folder 1', icon: 'star', href: '/files/s/1/fav1' },
                { title: 'Folder 2', icon: 'star', href: '/files/s/1/fav2' },
            ]
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
