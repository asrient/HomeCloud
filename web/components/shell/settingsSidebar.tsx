import { Sidebar } from "./sidebar";
import { useSettingsBar } from "../hooks/useSidebar";
import { SidebarItem } from "@/lib/types";
import { useCallback, useState } from "react";
import AddStorageModal from "../addStorageModal";
import useHideSidebar from "../hooks/useHideSidebar";

export function SettingsSidebar() {
    const list = useSettingsBar();
    const [showAddStorageModal, setShowAddStorageModal] = useState(false);
    const hideSidebar = useHideSidebar();

    const onClick = useCallback((item: SidebarItem, e: React.MouseEvent) => {
        if (item.key === 'add-storage') {
            e.preventDefault();
            setShowAddStorageModal(true);
            hideSidebar();
        }
    }, [hideSidebar]);

    return (
        <AddStorageModal
            isOpen={showAddStorageModal}
            onOpenChange={setShowAddStorageModal}
        >
            <Sidebar onClick={onClick} list={list} />
        </AddStorageModal>
    );
}
