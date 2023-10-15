import { Sidebar } from "./sidebar";
import { FilesSidebarData, useFilesBar } from "../hooks/useSidebar";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCallback, useState } from "react";
import { SidebarItem } from "@/lib/types";
import { useRouter } from "next/router";
import { removePin } from "@/lib/api/files";
import { ActionTypes } from "@/lib/state";
import { useAppDispatch } from "../hooks/useAppState";
import { useToast } from "@/components/ui/use-toast";

export function FilesSidebar() {
    const list = useFilesBar();
    const [selectedSidebarItem, setSelectedSidebarItem] = useState<SidebarItem | null>(null);
    const router = useRouter();
    const dispatch = useAppDispatch();
    const { toast } = useToast();

    const openItem = useCallback(() => {
        if (!selectedSidebarItem) return;
        router.push(selectedSidebarItem.href);
    }, [selectedSidebarItem, router]);

    const removePinnedFolder = useCallback(async () => {
        if (!selectedSidebarItem || !selectedSidebarItem.data) return;
        const { folderId, storageId } = (selectedSidebarItem.data as FilesSidebarData);
        if (!folderId || !storageId) return;
        try {
            const resp = await removePin({ storageId, folderId });
            if (!resp.ok) throw new Error('Failed to remove pin');
            dispatch(ActionTypes.REMOVE_PINNED_FOLDER, { storageId, folderId });
        } catch (e: any) {
            console.error(e);
            toast({
                variant: "destructive",
                title: 'Uh oh! Something went wrong.',
                description: `Could not remove from "${selectedSidebarItem.title}" favourites.`,
            });
        }
    }, [selectedSidebarItem, dispatch, toast]);

    const folderId = (selectedSidebarItem?.data as FilesSidebarData)?.folderId;

    return (<ContextMenu>
        <ContextMenuTrigger>
            <Sidebar onRightClick={setSelectedSidebarItem} list={list} />
        </ContextMenuTrigger>
        <ContextMenuContent>
            {
                folderId && (
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
                )
            }
        </ContextMenuContent>
    </ContextMenu>);
}
