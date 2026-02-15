import { app, Menu, MenuItemConstructorOptions } from 'electron';
import { getOrCreateWindow, navigateTo, getSettingsUrl, getPeerUrl } from './window';
import { getUpdateMenuItem, updateStatusChanged } from './updateCheck';

/**
 * Build and set the application menu.
 * Subscribes to peer changes to keep "Devices" up to date.
 */
export function setupAppMenu() {
    // Only set up the application menu on macOS where it appears in the system menu bar.
    // On Windows/Linux the menu bar would show inside the window, conflicting with the custom titlebar.
    if (process.platform !== 'darwin') {
        Menu.setApplicationMenu(null);
        return;
    }
    buildAppMenu();
    // Rebuild menu when peer list or update status changes
    const localSc = modules.getLocalServiceController();
    localSc.app.peerSignal.add(() => buildAppMenu());
    updateStatusChanged.add(() => buildAppMenu());
}

function buildAppMenu() {
    const template: MenuItemConstructorOptions[] = [
        // ——— App menu ———
        {
            label: app.getName(),
            submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                ...(!modules.config.IS_STORE_DISTRIBUTION ? [getUpdateMenuItem(), { type: 'separator' as const }] : []),
                {
                    label: 'Settings…',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => {
                        const win = getOrCreateWindow();
                        navigateTo(win, getSettingsUrl());
                    },
                },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
            ],
        },

        // ——— Edit ———
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'pasteAndMatchStyle' },
                { role: 'selectAll' },
            ],
        },

        // ——— View ———
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                ...(modules.config.IS_DEV ? [
                    { role: 'toggleDevTools' as const },
                ] : []),
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },

        // ——— Devices ———
        {
            label: 'Devices',
            submenu: buildDevicesSubmenu(),
        },

        // ——— Window ———
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { type: 'separator' },
                { role: 'front' },
            ],
        },

        // ——— Help ———
        {
            role: 'help',
            submenu: [
                {
                    label: 'HomeCloud Website',
                    click: () => {
                        const localSc = modules.getLocalServiceController();
                        localSc.app.openHelpLink('Website');
                    },
                },
                {
                    label: 'Report an Issue',
                    click: () => {
                        const localSc = modules.getLocalServiceController();
                        localSc.app.openHelpLink('ReportIssue');
                    },
                },
            ],
        },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

/**
 * Build the submenu items for the "Devices" top-level menu.
 */
function buildDevicesSubmenu(): MenuItemConstructorOptions[] {
    const localSc = modules.getLocalServiceController();
    const peers = localSc.app.getPeers();

    const peerItems: MenuItemConstructorOptions[] = peers.map(peer => ({
        label: peer.deviceName || peer.fingerprint.substring(0, 8),
        click: () => {
            const win = getOrCreateWindow();
            navigateTo(win, getPeerUrl(peer.fingerprint));
        },
    }));

    return [
        ...(peerItems.length > 0
            ? peerItems
            : [{ label: 'No devices', enabled: false }]),
        { type: 'separator' as const },
        {
            label: 'Add Device…',
            click: () => {
                const win = getOrCreateWindow();
                navigateTo(win, getSettingsUrl());
            },
        },
    ];
}
