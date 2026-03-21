import { BrowserWindow } from 'electron';
import path from 'node:path';
import { buildUrl } from './window';

// ── State ──

/** Open remote screen BrowserWindows keyed by fingerprint */
const screenWindows = new Map<string, BrowserWindow>();

// ── Public API ──

/**
 * Open a full-screen remote desktop viewer in its own BrowserWindow.
 *
 * - Like an RDP client: non-transparent, with title bar and window controls.
 * - Deduplicates: if a window for this fingerprint already exists, focus it.
 * - Streams the full remote screen and sends screen-relative input.
 */
export function createScreenWindow(
    fingerprint: string | null,
    deviceName?: string,
): BrowserWindow | null {
    const key = fingerprint ?? 'local';
    const existing = screenWindows.get(key);
    if (existing && !existing.isDestroyed()) {
        existing.focus();
        return existing;
    }

    const params: Record<string, string> = {};
    if (fingerprint) params.fingerprint = fingerprint;
    if (deviceName) params.title = deviceName;
    const url = buildUrl('/apps/window', params, false);

    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 400,
        minHeight: 300,
        title: deviceName ? `${deviceName} - Screen` : 'Remote Screen',
        frame: true,
        transparent: false,
        hasShadow: true,
        resizable: true,
        alwaysOnTop: false,
        show: true,
        paintWhenInitiallyHidden: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false,
            contextIsolation: false,
            backgroundThrottling: false,
        },
    });

    require('@electron/remote/main').enable(win.webContents);
    win.loadURL(url);

    screenWindows.set(key, win);

    win.on('closed', () => {
        screenWindows.delete(key);
        // Best-effort stop streaming session
        (async () => {
            try {
                const sc = fingerprint
                    ? await modules.getRemoteServiceController(fingerprint)
                    : modules.getLocalServiceController();
                await sc.apps.stopStreamingSession();
            } catch { }
        })();
    });

    return win;
}

// ── Terminal Window ──

const terminalWindows = new Set<BrowserWindow>();

export function createTerminalWindow(fingerprint: string | null): BrowserWindow {
    // Bring all existing terminal windows for this fingerprint to front
    for (const win of terminalWindows) {
        if (!win.isDestroyed()) win.show();
    }

    const params: Record<string, string> = {};
    if (fingerprint) params.fingerprint = fingerprint;
    const url = buildUrl('/terminal', params, false);

    const win = new BrowserWindow({
        width: 800,
        height: 500,
        minWidth: 400,
        minHeight: 300,
        frame: true,
        title: `Terminal`,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false,
            contextIsolation: false,
            backgroundThrottling: false,
        },
    });

    require('@electron/remote/main').enable(win.webContents);
    win.loadURL(url);

    terminalWindows.add(win);

    win.on('closed', () => {
        terminalWindows.delete(win);
    });

    return win;
}
