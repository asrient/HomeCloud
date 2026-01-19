import { clipboard } from 'electron';
import { Menu, MenuItem } from 'electron/main';
import { ClipboardContentType } from 'shared/types';

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
            type: item.type ?? 'normal',
            role: item.role,
            submenu: item.subItems ? buildMenu(item.subItems, callback) : undefined,
            click: item.type === 'separator' ? undefined : () => callback?.(item.id),
        });
        menu.append(menuItem);
    }

    return menu;
}

export function clipboardHasContent(): ClipboardContentType[] {
    const formats = clipboard.availableFormats();
    // map the formats to a simpler list
    const contentTypes: Set<ClipboardContentType> = new Set();
    formats.forEach(format => {
        switch (format) {
            case 'text/plain':
                contentTypes.add('text');
                break;
            case 'text/html':
                contentTypes.add('html');
                break;
            case 'text/rtf':
                contentTypes.add('rtf');
                break;
            case 'text/uri-list':
                contentTypes.add('filePath');
                break;
            default:
                if (format.startsWith('image/')) {
                    contentTypes.add('image');
                }
        }
    });
    return Array.from(contentTypes);
}
