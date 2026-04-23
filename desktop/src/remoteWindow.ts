import { BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { buildUrl } from './window';
import { getServiceController } from 'shared/utils';

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
                await sc.screen.stopStreamingSession();
            } catch { }
        })();
    });

    return win;
}

// ── Terminal Window ──

interface TerminalWindowInfo {
    fingerprint: string | null;
    sessionId: string | null;
    sessionEnded: boolean;
}

const terminalWindows = new Map<BrowserWindow, TerminalWindowInfo>();

function getTerminalWindow(fingerprint: string | null, sessionId: string): { win: BrowserWindow; info: TerminalWindowInfo } | null {
    for (const [win, info] of terminalWindows) {
        if (info.fingerprint === fingerprint && info.sessionId === sessionId) {
            return { win, info };
        }
    }
    return null;
}

export function markTerminalSessionEnded(fingerprint: string | null, sessionId: string): void {
    const result = getTerminalWindow(fingerprint, sessionId);
    if (result) {
        result.info.sessionEnded = true;
    } else {
        console.warn(`[markTerminalSessionEnded] No terminal window found for sessionId ${sessionId}`);
    }
}

export function createTerminalWindow(
    fingerprint: string | null,
    sessionId?: string,
): BrowserWindow {
    // Dedup: if a window for this session already exists, focus it
    if (sessionId) {
        const existing = getTerminalWindow(fingerprint, sessionId);
        if (existing && !existing.win.isDestroyed()) {
            existing.win.focus();
            return existing.win;
        }
    }

    const params: Record<string, string> = {};
    if (fingerprint) params.fingerprint = fingerprint;
    if (sessionId) params.sessionId = sessionId;
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

    const info: TerminalWindowInfo = {
        fingerprint,
        sessionId: sessionId ?? null,
        sessionEnded: false,
    };
    terminalWindows.set(win, info);

    // For persistent sessions, intercept close and ask kill/detach
    win.on('close', (e) => {
        const winInfo = terminalWindows.get(win);
        if (!winInfo || !winInfo.sessionId || winInfo.sessionEnded) return;

        e.preventDefault();

        (async () => {
            const { response } = await dialog.showMessageBox(win, {
                type: 'question',
                title: 'Close Terminal',
                message: 'This session is still running. What would you like to do?',
                buttons: ['Detach', 'Kill', 'Cancel'],
                defaultId: 0,
                cancelId: 2,
            });

            if (response === 2) return; // Cancel

            // Close window immediately — don't wait for server
            terminalWindows.delete(win);
            win.destroy();

            if (response === 1) {
                // Kill the session in background
                getServiceController(winInfo.fingerprint)
                    .then(sc => sc.terminal.stopTerminalSession(winInfo.sessionId!))
                    .catch(() => {});
            }
        })();
    });

    win.on('closed', () => {
        terminalWindows.delete(win);
    });

    return win;
}
