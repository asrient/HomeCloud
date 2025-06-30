import { Sidebar } from "./sidebar";
import { SidebarItem, SidebarList } from "@/lib/types";
import { useCallback, useMemo, useState } from "react";
import { deviceSettingsUrl, buildNextUrl } from "@/lib/urls";
import { usePeerState } from "../hooks/usePeerState";
import { getUrlFromIconKey } from "@/lib/utils"
import AddPeerModal from "../addPeerModal";


export function SettingsSidebar() {
    const [showAddPeerModal, setShowAddPeerModal] = useState(false);
    const peers = usePeerState();

    const list = useMemo<SidebarList>(() => {
        const deviceList: SidebarItem[] = peers.map((p) => {
            return {
                title: p.deviceName,
                icon: getUrlFromIconKey(p.iconKey),
                href: deviceSettingsUrl(p.fingerprint),
                key: p.fingerprint,
            }
        })

        deviceList.push({
            title: 'Add device',
            icon: '/icons/add.png',
            key: 'add-storage',
        })

        return [
            {
                items: [
                    {
                        title: 'General',
                        href: buildNextUrl('/settings/general'),
                        icon: '/icons/settings.png',
                        key: 'general',
                    },
                ]
            },
            {
                title: 'My Devices',
                items: deviceList,
            },
        ]
    }, [peers])

    const onClick = useCallback((item: SidebarItem, e: React.MouseEvent) => {
        if (item.key === 'add-storage') {
            e.preventDefault();
            setShowAddPeerModal(true);
        }
    }, []);

    return (
        <AddPeerModal
            isOpen={showAddPeerModal}
            onOpenChange={setShowAddPeerModal}
        >
            <Sidebar onClick={onClick} list={list} />
        </AddPeerModal>
    );
}
