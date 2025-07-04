import { SidebarSectionView, SidebarView } from "./sidebar";
import { SidebarItem, SidebarSection } from "@/lib/types";
import { useMemo } from "react";
import { useAppState } from "../hooks/useAppState";
import { buildNextUrl } from "@/lib/urls";
import { PeerInfo } from "shared/types";
import { usePhotoLibraries } from "../hooks/usePhotos";
import { iconUrl, FileType } from "@/lib/fileUtils";
import { photosLibraryUrl } from "@/lib/urls";

const DeviceSectionView = ({
    peer
}: {
    peer?: PeerInfo
}) => {
    const fingerprint = useMemo(() => !!peer ? peer.fingerprint : null, [peer]);
    const { photoLibraries } = usePhotoLibraries(fingerprint);

    const section = useMemo((): SidebarSection => {
        const items: SidebarItem[] = [];
        photoLibraries.forEach((library) => {
            items.push({
                title: library.name,
                icon: iconUrl(FileType.Folder),
                href: photosLibraryUrl(fingerprint, library.id),
                key: library.id,
                rightClickable: false,
            });
        });
        return {
            title: peer ? peer.deviceName : 'This Device',
            items
        };
    }, [photoLibraries, fingerprint, peer]);

    return (<SidebarSectionView section={section} />);
}

export function PhotosSidebar() {
    const { peers } = useAppState();

    return (
            <SidebarView>
                <DeviceSectionView />
                {peers.map((peer) => (
                    <DeviceSectionView key={peer.fingerprint} peer={peer} />
                ))}
            </SidebarView>
        )
}
