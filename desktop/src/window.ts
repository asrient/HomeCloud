import { BrowserWindow, Menu, MenuItemConstructorOptions, nativeTheme } from 'electron';
import path from 'node:path';

const WEB_APP_SERVER = 'http://localhost:3000';

// Build a URL for a given relative path based on serving mode
export function buildUrl(relativePath: string = '/', queryParams: Record<string, string> = {}, back = true): string {
    // Ensure path starts with /
    const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;

    // Build query string
    const params = new URLSearchParams({ back: back ? 'on' : 'off', ...queryParams });
    const queryString = params.toString();

    if (modules.config.USE_WEB_APP_SERVER) {
        return `${WEB_APP_SERVER}${normalizedPath}?${queryString}`;
    } else {
        // For static serving, append .html for non-root paths
        const htmlPath = normalizedPath === '/' ? '/index.html' : `${normalizedPath}.html`;
        return `app://-${htmlPath}?${queryString}`;
    }
}

function shouldShowDevTools(): boolean {
    return modules.config.IS_DEV && !modules.config.IS_DESKTOP_PACKED;
}

function handleContextMenuFromWindow(win: BrowserWindow) {
    win.webContents.on('context-menu', (event, params) => {
        // We handle text and link selection from here.
        const hasText = params.selectionText.length > 0;
        if (!hasText) {
            return;
        }
        const template: MenuItemConstructorOptions[] = [
            {
                label: 'Copy',
                role: 'copy',
                accelerator: 'CmdOrCtrl+C',
                enabled: params.editFlags.canCopy,
                click: () => {
                    win.webContents.copy();
                }
            },
        ];
        if (params.editFlags.canCut) {
            template.unshift({
                label: 'Cut',
                role: 'cut',
                accelerator: 'CmdOrCtrl+X',
                enabled: params.editFlags.canCut,
                click: () => {
                    win.webContents.cut();
                }
            });
        }
        if (params.editFlags.canPaste) {
            template.push({
                label: 'Paste',
                role: 'paste',
                accelerator: 'CmdOrCtrl+V',
                enabled: params.editFlags.canPaste,
                click: () => {
                    win.webContents.paste();
                }
            });
        }
        if (process.platform === 'darwin') {
            template.push({
                label: 'Search with Google',
                enabled: params.editFlags.canCopy,
                click: () => {
                    const query = encodeURIComponent(params.selectionText);
                    const url = `https://www.google.com/search?q=${query}`;
                    win.webContents.send('open-external-link', url);
                }
            });
        }
        const menu = Menu.buildFromTemplate(template);
        menu.popup({ window: win, x: params.x, y: params.y });
    });
}

export function createWindow(url?: string): BrowserWindow {
    // Create the browser window.
    const isSystemDarkMode = nativeTheme.shouldUseDarkColors;
    console.log('System dark mode:', isSystemDarkMode);
    const win = new BrowserWindow({
        width: process.platform === 'darwin' ? 1040 : 1200,
        height: process.platform === 'darwin' ? 640 : 860,
        minWidth: 900,
        minHeight: 600,
        // remove the default titlebar
        titleBarStyle: 'hidden',
        backgroundMaterial: 'mica',
        vibrancy: 'titlebar',
        trafficLightPosition: { x: 20, y: 20 },
        // expose window controls in Windows/Linux
        ...(process.platform !== 'darwin' ? {
            titleBarOverlay: {
                // make controls transparent
                color: '#00000000',
                // make symbol color white if the system is dark mode
                symbolColor: isSystemDarkMode ? '#ffffff' : '#000000',
            }
        } : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false,
            contextIsolation: false, // Disable context isolation for remote module
        },
    });

    require("@electron/remote/main").enable(win.webContents);

    // Load the URL
    const loadUrl = url || getHomeUrl();
    console.log('Loading URL:', loadUrl);
    win.loadURL(loadUrl);

    handleContextMenuFromWindow(win);

    // Open the DevTools.
    if (shouldShowDevTools()) {
        win.webContents.openDevTools();
    }

    return win;
}

export function getOrCreateWindow(): BrowserWindow {
    // Try to get focused window first
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
        return focusedWindow;
    }

    // Try to get any existing window
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 0) {
        const win = allWindows[0];
        win.show();
        win.focus();
        return win;
    }

    // Create a new window
    return createWindow();
}

// Navigate an existing window to a new path
export function navigateTo(win: BrowserWindow, url: string): void {
    console.log('Navigating to:', url);
    win.loadURL(url);
    win.show();
    win.focus();
}

// Navigation helpers
export function getSettingsUrl(): string {
    return buildUrl('/settings');
}

export function getHomeUrl(): string {
    return buildUrl('/', {}, false);
}

export function getPeerUrl(fingerprint: string | null): string {
    const opts = fingerprint ? { fingerprint } : {};
    return buildUrl('/', opts);
}
