import { Sidebar } from "./sidebar";
import { usePhotosBar, PhotosSidebarData } from "../hooks/useSidebar";
import { SidebarItem } from "@/lib/types";
import { useCallback, useMemo, useState } from "react";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";
import { ActionTypes } from "@/lib/state";
import { useToast } from "../ui/use-toast";
import { useAppDispatch } from "../hooks/useAppState";

export function PhotosSidebar() {
    const list = usePhotosBar();
    const [selectedSidebarItem, setSelectedSidebarItem] = useState<SidebarItem | null>(null);
    const { toast } = useToast();
    const dispatch = useAppDispatch();

    const isLibrarySelected = useMemo(() => {
        return selectedSidebarItem?.data?.libraryId !== undefined;
    }, [selectedSidebarItem]);

    const removeLibrary = useCallback(async () => {
        if (!selectedSidebarItem || !selectedSidebarItem.data) return;
        const { libraryId, storageId } = (selectedSidebarItem.data as PhotosSidebarData);
        if (!libraryId || !storageId) return;
        try {
            //await deleteLibrary({ storageId, id: libraryId });
            //dispatch(ActionTypes.REMOVE_PHOTO_LIBRARY, { storageId, libraryId });
        } catch (e: any) {
            console.error(e);
            toast({
                variant: "destructive",
                title: 'Uh oh! Something went wrong.',
                description: `Could not remove "${selectedSidebarItem.title}" library.`,
            });
        }
    }, [selectedSidebarItem, toast]);

    return (<ContextMenu>
        <ContextMenuTrigger>
            <Sidebar onRightClick={setSelectedSidebarItem} list={list} />
        </ContextMenuTrigger>
        <ContextMenuContent>
            {
                isLibrarySelected && (
                    <>
                        <ContextMenuItem>
                            Get info
                        </ContextMenuItem>
                        <ContextMenuItem onClick={removeLibrary} className='text-red-500'>
                            Remove
                        </ContextMenuItem>
                    </>
                )
            }
        </ContextMenuContent>
    </ContextMenu>);
}
