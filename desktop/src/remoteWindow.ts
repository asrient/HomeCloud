import { BrowserWindow } from 'electron';
import path from 'node:path';
import { RemoteAppWindow, RemoteAppWindowType, RemoteAppWindowAction, RemoteAppInfo, WindowEvent } from 'shared/types';
import { buildUrl } from './window';

// ── Constants ──

/** Skip windows smaller than this in either dimension */
const MIN_WINDOW_SIZE = 10;

/** Window types that should not be user-resizable */
const NON_RESIZABLE_TYPES = new Set<RemoteAppWindowType>([
    RemoteAppWindowType.Modal,
    RemoteAppWindowType.Tooltip,
    RemoteAppWindowType.ContextMenu,
    RemoteAppWindowType.Popup,
]);

/** Window types that float above other windows */
const ALWAYS_ON_TOP_TYPES = new Set<RemoteAppWindowType>([
    RemoteAppWindowType.Floating,
    RemoteAppWindowType.Tooltip,
    RemoteAppWindowType.ContextMenu,
    RemoteAppWindowType.Popup,
]);

/** Transient window types that should not steal focus (avoids dismissing remote context menus on Windows) */
const SHOW_INACTIVE_TYPES = new Set<RemoteAppWindowType>([
    RemoteAppWindowType.Tooltip,
    RemoteAppWindowType.ContextMenu,
    RemoteAppWindowType.Popup,
]);

// ── State ──

/** Open remote BrowserWindows keyed by "fingerprint:windowId" */
const remoteWindows = new Map<string, BrowserWindow>();

/** Heartbeat interval — must be well under server's WINDOW_POLL_IDLE_TIMEOUT (3 min) */
const WATCH_HEARTBEAT_MS = 60_000; // 1 minute

/** Per-app signal watchers keyed by "fingerprint:appId" */
const appWindowWatchers = new Map<string, {
    createdRef: any;
    destroyedRef: any;
    sc: any;
    heartbeat: ReturnType<typeof setInterval>;
}>();

// ── Helpers ──

function windowKey(fingerprint: string | null, windowId: string): string {
    return `${fingerprint ?? 'local'}:${windowId}`;
}

function watcherKey(fingerprint: string | null, appId: string): string {
    return `${fingerprint ?? 'local'}:${appId}`;
}

function isTooSmall(w: RemoteAppWindow): boolean {
    return w.width < MIN_WINDOW_SIZE || w.height < MIN_WINDOW_SIZE;
}

/** Find the BrowserWindow for a remote parent window, if open. */
function findParentBrowserWindow(
    parentWindowId: string | undefined,
    fingerprint: string | null,
): BrowserWindow | null {
    if (!parentWindowId) return null;
    const bw = remoteWindows.get(windowKey(fingerprint, parentWindowId));
    return bw && !bw.isDestroyed() ? bw : null;
}

/**
 * Compute the screen position for a child window by mapping the offset
 * between the child and parent on the remote screen onto the local parent
 * BrowserWindow's position.
 */
function computeChildPosition(
    parentBW: BrowserWindow,
    child: RemoteAppWindow,
    parentRemote: RemoteAppWindow | undefined,
): { x: number; y: number } {
    const [px, py] = parentBW.getPosition();
    if (parentRemote) {
        return {
            x: px + Math.round(child.x - parentRemote.x),
            y: py + Math.round(child.y - parentRemote.y),
        };
    }
    // Fallback: center over parent
    const [pw, ph] = parentBW.getSize();
    return {
        x: px + Math.round((pw - child.width) / 2),
        y: py + Math.round((ph - child.height) / 2),
    };
}

// ── Public API ──

/**
 * Open a remote-app window in its own BrowserWindow.
 *
 * - Deduplicates: if a BrowserWindow for the same windowId already exists it is focused.
 * - Positions child windows relative to their parent BrowserWindow.
 * - Configures resizable / alwaysOnTop / close-on-blur based on window type.
 * - Skips windows that are too small (< MIN_WINDOW_SIZE).
 * - Subscribes to the windowCreated/windowDestroyed signals so new windows are auto-opened.
 */
export function createRemoteWindow(
    w: RemoteAppWindow,
    fingerprint: string | null,
    appId: string,
    parentRemote?: RemoteAppWindow,
): BrowserWindow | null {
    if (isTooSmall(w)) return null;

    const key = windowKey(fingerprint, w.id);
    const existing = remoteWindows.get(key);
    if (existing && !existing.isDestroyed()) {
        existing.focus();
        return existing;
    }

    const params: Record<string, string> = { windowId: w.id, title: w.title };
    if (fingerprint) params.fingerprint = fingerprint;
    const url = buildUrl('/apps/window', params, false);

    const type = w.type as RemoteAppWindowType;
    const resizable = !NON_RESIZABLE_TYPES.has(type);
    const alwaysOnTop = ALWAYS_ON_TOP_TYPES.has(type);
    const showInactive = SHOW_INACTIVE_TYPES.has(type);

    // Position relative to parent if available
    let x: number | undefined;
    let y: number | undefined;
    const parentBW = findParentBrowserWindow(w.parentWindowId, fingerprint);
    if (parentBW) {
        const pos = computeChildPosition(parentBW, w, parentRemote);
        x = pos.x;
        y = pos.y;
    }

    const win = new BrowserWindow({
        width: Math.max(w.width, 200),
        height: Math.max(w.height, 200),
        x,
        y,
        minWidth: resizable ? 200 : undefined,
        minHeight: resizable ? 150 : undefined,
        title: w.title,
        frame: false,
        transparent: true,
        hasShadow: true,
        resizable,
        alwaysOnTop,
        show: !showInactive,
        skipTaskbar: type !== RemoteAppWindowType.Regular,
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

    if (showInactive) {
        win.showInactive();
    }

    remoteWindows.set(key, win);

    // Focus the remote window when this BrowserWindow gains focus
    // Skip for transient types — focusing them on the remote can dismiss context menus on Windows
    if (!showInactive) {
        win.on('focus', async () => {
            console.log('[remoteWindow] focus event fired for window:', w.id, 'fingerprint:', fingerprint);
            try {
                const sc = fingerprint
                    ? await modules.getRemoteServiceController(fingerprint)
                    : modules.getLocalServiceController();
                console.log('[remoteWindow] got SC, dispatching focus action');
                await sc.apps.performWindowAction({
                    action: RemoteAppWindowAction.Focus,
                    windowId: w.id,
                });
                console.log('[remoteWindow] focus action completed');
            } catch (e) {
                console.error('Failed to focus remote window:', e);
            }
        });
    }

    win.on('closed', () => {
        remoteWindows.delete(key);
        // Stop any active streaming session for this window (main-process, reliable)
        (async () => {
            try {
                const sc = fingerprint
                    ? await modules.getRemoteServiceController(fingerprint)
                    : modules.getLocalServiceController();
                await sc.apps.stopStreamingSession(w.id);
            } catch { }
        })();
        cleanupAppWatcher(appId, fingerprint);
    });

    // Start watching window changes for this app
    ensureAppWindowWatcher(appId, fingerprint);

    return win;
}

// ── App window watchers ──

async function ensureAppWindowWatcher(appId: string, fingerprint: string | null) {
    const wKey = watcherKey(fingerprint, appId);
    if (appWindowWatchers.has(wKey)) return;

    try {
        const sc = fingerprint
            ? await modules.getRemoteServiceController(fingerprint)
            : modules.getLocalServiceController();

        await sc.apps.watchWindowsHeartbeat();

        const createdRef = sc.apps.windowCreated.add((evt: WindowEvent) => {
            if (evt.app.id !== appId) return;
            onWindowCreated(appId, fingerprint, evt.window);
        });

        const destroyedRef = sc.apps.windowDestroyed.add((evt: WindowEvent) => {
            if (evt.app.id !== appId) return;
            onWindowDestroyed(fingerprint, evt.window);
        });

        // Periodically re-call watchWindowsHeartbeat to keep the server-side watcher alive
        const heartbeat = setInterval(() => {
            sc.apps.watchWindowsHeartbeat().catch(() => {});
        }, WATCH_HEARTBEAT_MS);

        appWindowWatchers.set(wKey, { createdRef, destroyedRef, sc, heartbeat });
    } catch (e) {
        console.error(`Failed to watch windows for ${appId}:`, e);
    }
}

function cleanupAppWatcher(appId: string, fingerprint: string | null) {
    const wKey = watcherKey(fingerprint, appId);
    const prefix = `${fingerprint ?? 'local'}:`;

    // Keep the watcher alive while any remote window for this fingerprint is still open
    for (const [key] of remoteWindows) {
        if (key.startsWith(prefix)) return;
    }

    const watcher = appWindowWatchers.get(wKey);
    if (watcher) {
        clearInterval(watcher.heartbeat);
        try {
            watcher.sc.apps.windowCreated.detach(watcher.createdRef);
            watcher.sc.apps.windowDestroyed.detach(watcher.destroyedRef);
        } catch { }
        appWindowWatchers.delete(wKey);
    }
}

function onWindowCreated(appId: string, fingerprint: string | null, w: RemoteAppWindow) {
    const key = windowKey(fingerprint, w.id);
    if (remoteWindows.has(key)) return;
    if (isTooSmall(w)) return;
    createRemoteWindow(w, fingerprint, appId);
}

function onWindowDestroyed(fingerprint: string | null, w: RemoteAppWindow) {
    const key = windowKey(fingerprint, w.id);
    const bw = remoteWindows.get(key);
    if (bw && !bw.isDestroyed()) {
        bw.close();
    }
}

// ── Terminal Window ──

const terminalWindows = new Map<string, BrowserWindow>();

export function createTerminalWindow(fingerprint: string | null): BrowserWindow {
    const key = `terminal-${fingerprint ?? 'local'}`;
    const existing = terminalWindows.get(key);
    if (existing && !existing.isDestroyed()) {
        existing.focus();
        return existing;
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

    terminalWindows.set(key, win);

    win.on('closed', () => {
        terminalWindows.delete(key);
    });

    return win;
}
