import { ContextMenuItem } from "@/lib/types"
import { useCallback } from "react";

export type ContextMenuOptions = {
    onMenuOpen: () => ContextMenuItem[] | undefined;
    onMenuItemClick: (id: string) => void;
    style?: React.CSSProperties;
    children: React.ReactNode;
}

export const ContextMenuArea = (options: ContextMenuOptions) => {
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        const items = options.onMenuOpen();
        if (items !== undefined) {
            if (items.length > 0) {
                window.utils.openContextMenu(items, options.onMenuItemClick);
            }
            e.preventDefault();
            e.stopPropagation();
        }
    }, [options]);

    return (
        <div onContextMenu={handleContextMenu} style={options.style}>
            {options.children}
        </div>
    );
}
