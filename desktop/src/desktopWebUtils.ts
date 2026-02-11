import { Menu, MenuItem } from 'electron/main';
import { hasFilePathsInClipboard } from './services/system/clipboard';

export type ContextMenuItem = {
    label?: string;
    description?: string;
    id: string;
    disabled?: boolean;
    isChecked?: boolean;
    type?: 'separator' | 'normal' | 'checkbox' | 'radio';
    role?: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll' | 'minimize' | 'close' | 'delete';
    subItems?: ContextMenuItem[];
}

export function openContextMenu(items: ContextMenuItem[], callback?: (id: string) => void): void {
    const menu = buildMenu(items, callback);
    menu.popup();
}

function buildMenu(items: ContextMenuItem[], callback?: (id: string) => void): Menu {
    const menu = new Menu();

    for (const item of items) {
        const menuItem = new MenuItem({
            label: item.label,
            id: item.id,
            enabled: !item.disabled,
            checked: item.isChecked,
            type: item.type ?? (item.subItems ? 'submenu' : 'normal'),
            role: item.role,
            submenu: item.subItems ? buildMenu(item.subItems, callback) : undefined,
            click: item.type === 'separator' ? undefined : () => callback?.(item.id),
        });
        menu.append(menuItem);
    }

    return menu;
}

export function clipboardHasFiles(): boolean {
    return hasFilePathsInClipboard();
}
