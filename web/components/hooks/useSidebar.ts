import { AppName, PhotoLibrary, SidebarItem, SidebarList } from "@/lib/types";
import { useAppState } from "./useAppState";
import { folderViewUrl, buildNextUrl, photosLibraryUrl } from "@/lib/urls";
import { iconUrl, FileType } from "@/lib/fileUtils";

export type PhotosSidebarData = {
    libraryId: number;
    storageId: number;
}

export function usePhotosBar(): SidebarList {
    // const storages = useFilterStorages(AppName.Photos);
    // const { photoLibraries } = useAppState();
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

    // storages?.forEach((storage) => {
    //     const libs: PhotoLibrary[] = photoLibraries ? (photoLibraries[storage.id] || []) : [];
    //     const items: SidebarItem[] = [];
    //     libs.forEach((lib) => {
    //         items.push({
    //             title: lib.name,
    //             icon: iconUrl(FileType.Folder),
    //             href: photosLibraryUrl(storage.id, lib.id),
    //             key: `${storage.id}-${lib.id}`,
    //             rightClickable: true,
    //             data: {
    //                 libraryId: lib.id,
    //                 storageId: storage.id,
    //             } as PhotosSidebarData,
    //         });
    //     });
    //     list.push({
    //         title: storage.name,
    //         items,
    //     });
    // });
    return list;
}
