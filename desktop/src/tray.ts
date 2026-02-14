import { app, Menu, MenuItemConstructorOptions, Tray, nativeImage, dialog, shell } from 'electron';
import path from 'node:path';
import { getOrCreateWindow, navigateTo, getPeerUrl, getSettingsUrl } from './window';
import { osInfoString } from './utils';
import { checkForUpdates, getUpdateStatus } from './updateCheck';

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
        ? peers.map(peer => {
            let sublabel = osInfoString(peer.deviceInfo);
            const connection = localSc.net.getConnectionInfo(peer.fingerprint);
            if (connection) {
                sublabel += ' - Connected';
            }
            return {
                label: peer.deviceName || peer.fingerprint.substring(0, 8),
                click: () => {
                    const win = getOrCreateWindow();
                    navigateTo(win, getPeerUrl(peer.fingerprint));
                },
                sublabel,
            }
        })
        : [{ label: 'No devices', enabled: false }];

    const contextMenu = Menu.buildFromTemplate([
        {
            label: `Open ${app.getName()}`,
            click: () => {
                getOrCreateWindow();
            }
        },
        { type: 'separator' },
        ...peersSubmenu,
        { type: 'separator' },
        ...(!modules.config.IS_STORE_DISTRIBUTION ? [getUpdateMenuItem()] : []),
        {
            label: 'Settings',
            click: () => {
                const win = getOrCreateWindow();
                navigateTo(win, getSettingsUrl());
            }
        },
        {
            label: 'Quit',
            click: () => {
                app.quit();
            }
        }
    ]);

    tray.popUpContextMenu(contextMenu);
}

function getUpdateMenuItem(): MenuItemConstructorOptions {
    const status = getUpdateStatus();

    if (status === 'checking') {
        return { label: 'Checking for updates...', enabled: false };
    }

    if (status === 'available') {
        return {
            label: 'Update available',
            click: () => showUpdateDialog(),
        };
    }

    return {
        label: 'Check for updates',
        click: async () => {
            const info = await checkForUpdates(true);
            if (!info) {
                dialog.showMessageBox({
                    type: 'warning',
                    title: 'Update Check',
                    message: 'Could not check for updates.',
                    detail: 'Please check your internet connection and try again.',
                });
                return;
            }
            if (info.updateAvailable) {
                showUpdateDialog();
            }
        },
    };
}

async function showUpdateDialog() {
    const info = await checkForUpdates();
    if (!info) return;
    const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `A new version of ${app.getName()} is available!`,
        detail: `Current: v${info.currentVersion}\nLatest: v${info.latestVersion}\n\n${info.releaseName}${info.releaseNotes ? '\n\n' + info.releaseNotes : ''}`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
    });
    if (response === 0) {
        shell.openExternal(info.releaseUrl);
    }
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
