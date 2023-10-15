import { Sidebar } from "./sidebar";
import { usePhotosBar } from "../hooks/useSidebar";

export function PhotosSidebar() {
    const list = usePhotosBar();

    return (<Sidebar list={list} />);
}
