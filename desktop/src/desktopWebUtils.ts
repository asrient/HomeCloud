import { BrowserWindow, Menu, MenuItem } from 'electron/main';
import { hasFilePathsInClipboard } from './services/system/clipboard';
import { checkForUpdates as _checkForUpdates, getUpdateStatus as _getUpdateStatus, triggerUpdateCheck as _triggerUpdateCheck, UpdateInfo, UpdateStatus } from './updateCheck';
import { createScreenWindow, createTerminalWindow, markTerminalSessionEnded } from './remoteWindow';

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

export function checkForUpdates(force = false): Promise<UpdateInfo | null> {
    return _checkForUpdates(force);
}

export function getUpdateStatus(): UpdateStatus {
    return _getUpdateStatus();
}

export function triggerUpdateCheck(): void {
    _triggerUpdateCheck();
}

export function openScreenWindow(
    fingerprint: string | null,
    deviceName?: string,
): void {
    createScreenWindow(fingerprint, deviceName);
}

export function openTerminalWindow(fingerprint: string | null, sessionId?: string): void {
    createTerminalWindow(fingerprint, sessionId);
}

export function notifyTerminalSessionEnded(fingerprint: string | null, sessionId: string): void {
    markTerminalSessionEnded(fingerprint, sessionId);
}

export function getWindowControls(win: BrowserWindow) {
    return {
        close: () => win.close(),
        minimize: () => win.minimize(),
        maximize: () => win.isMaximized() ? win.unmaximize() : win.maximize(),
        resize: (w: number, h: number) => win.setContentSize(w, h),
    };
}
