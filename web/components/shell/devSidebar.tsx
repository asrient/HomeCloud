import { Sidebar } from "./sidebar";
import { SidebarList } from "@/lib/types";
import { buildNextUrl } from "@/lib/urls";

const list: SidebarList = [
    {
        items: [
            {
                title: 'Config',
                href: buildNextUrl('/dev'),
                icon: '/icons/computer.png',
                key: 'info',
            },
            {
                title: 'Services',
                href: buildNextUrl('/dev/playground'),
                icon: '/icons/program.png',
                key: 'playground',
            },
        ]
    },
]

export function DevSidebar() {

    return (
        <Sidebar list={list} />
    );
}
