import { Sidebar } from "./sidebar";
import { useDevBar } from "../hooks/useSidebar";

export function DevSidebar() {
    const list = useDevBar();

    return (
        <Sidebar list={list} />
    );
}
