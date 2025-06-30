import { SidebarSectionView, SidebarView } from "./sidebar";
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
import { PeerInfo } from "shared/types";
import { useFolder, usePinnedFolders } from "../hooks/useFolders";
import { getDefaultIcon, pinnedFolderToRemoteItem } from "@/lib/fileUtils";
import { buildNextUrl, folderViewUrl } from "@/lib/urls";
import { getServiceController } from "@/lib/utils";

type FilesSidebarData = {
    path?: string;
    deviceFingerprint: string | null;
}

const DeviceSectionView = ({
    peer
}: {
    peer?: PeerInfo
}) => {

    const fingerprint = useMemo(() => !!peer ? peer.fingerprint : null, [peer]);

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
            return pinnedFolderToRemoteItem(pinned, fingerprint);
        });
        const items: SidebarItem[] = [];
        [...pinnedRemoteItems, ...disks].forEach((disk) => {
            const sidebarData: FilesSidebarData = {
                path: disk.path,
                deviceFingerprint: fingerprint
            };
            items.push({
                title: disk.name,
                icon: getDefaultIcon(disk),
                href: folderViewUrl(fingerprint, disk.path),
                key: disk.path,
                data: sidebarData,
                rightClickable: true,
            });
        });
        return {
            title: peer ? peer.deviceName : 'This Device',
            items
        };
    }, [disks, fingerprint, peer, pinnedFolders]);

    const folderPath = (selectedSidebarItem?.data as FilesSidebarData)?.path;

    return (<ContextMenu>
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
    </ContextMenu>);
}

export function FilesSidebar() {
    const { peers } = useAppState();

    return (
        <SidebarView>
            <SidebarSectionView
                section={
                    {
                        items: [{
                            title: 'All Files',
                            icon: '/icons/stack.png',
                            href: buildNextUrl('/files'),
                            key: 'files'
                        }]
                    }
                } />
            <DeviceSectionView />
            {peers.map((peer) => (
                <DeviceSectionView key={peer.fingerprint} peer={peer} />
            ))}
        </SidebarView>
    )
}
