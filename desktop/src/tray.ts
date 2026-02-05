import { app, Menu, MenuItemConstructorOptions, Tray, nativeImage } from 'electron';
import path from 'node:path';
import { getOrCreateWindow, navigateTo, getPeerUrl, getSettingsUrl } from './window';

let tray: Tray | null = null;

// Get the appropriate tray icon path based on platform
function getTrayIconPath(): string {
    const basePath = path.join(__dirname, '..', 'assets', 'appIcons');

    if (process.platform === 'darwin') {
        // Use template image for macOS menu bar
        return path.join(basePath, 'iconTemplate.png');
    } else if (process.platform === 'win32') {
        return path.join(basePath, 'icon.ico');
    } else {
        return path.join(basePath, 'icon.png');
    }
}

// Build and update the tray context menu
export function trayOnClick() {
    if (!tray) return;

    const localSc = modules.getLocalServiceController();
    const peers = localSc.app.getPeers();

    const peersSubmenu: MenuItemConstructorOptions[] = peers.length > 0
        ? peers.map(peer => ({
            label: peer.deviceName || peer.fingerprint.substring(0, 8),
            click: () => {
                const win = getOrCreateWindow();
                navigateTo(win, getPeerUrl(peer.fingerprint));
            }
        }))
        : [{ label: 'No devices', enabled: false }];

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open',
            click: () => {
                getOrCreateWindow();
            }
        },
        { type: 'separator' },
        {
            label: 'My Devices',
            submenu: peersSubmenu
        },
        {
            label: 'Settings',
            click: () => {
                const win = getOrCreateWindow();
                navigateTo(win, getSettingsUrl());
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.quit();
            }
        }
    ]);

    tray.popUpContextMenu(contextMenu);
}

export function createTray() {
    const iconPath = getTrayIconPath();
    console.log('Creating tray with icon:', iconPath);

    const icon = nativeImage.createFromPath(iconPath);
    if (process.platform === 'darwin') {
        icon.setTemplateImage(true);
    }

    tray = new Tray(icon);
    tray.setToolTip(app.getName());

    // Double-click on tray icon to show window (Windows/Linux)
    tray.on('double-click', () => {
        getOrCreateWindow();
    });

    tray.on('click', trayOnClick);
    tray.on('right-click', trayOnClick);
}

export function destroyTray() {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}
