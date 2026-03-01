import { BrowserWindow } from 'electron';
import path from 'node:path';
import { RemoteAppWindow, RemoteAppWindowType, RemoteAppWindowAction } from 'shared/types';
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
const appWindowWatchers = new Map<string, { signalRef: any; sc: any; heartbeat: ReturnType<typeof setInterval> }>();

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
 * - Subscribes to the windowsChanged signal so new windows are auto-opened.
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
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false,
            contextIsolation: false,
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

        await sc.apps.watchWindows(appId);

        const signalRef = sc.apps.windowsChanged.add((changedAppId: string, windows: RemoteAppWindow[]) => {
            if (changedAppId !== appId) return;
            onWindowsChanged(appId, fingerprint, windows);
        });

        // Periodically re-call watchWindows to keep the server-side watcher alive
        const heartbeat = setInterval(() => {
            sc.apps.watchWindows(appId).catch(() => {});
        }, WATCH_HEARTBEAT_MS);

        appWindowWatchers.set(wKey, { signalRef, sc, heartbeat });
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
            watcher.sc.apps.windowsChanged.detach(watcher.signalRef);
        } catch { }
        watcher.sc.apps.unwatchWindows(appId).catch(() => { });
        appWindowWatchers.delete(wKey);
    }
}

function onWindowsChanged(appId: string, fingerprint: string | null, windows: RemoteAppWindow[]) {
    const prefix = `${fingerprint ?? 'local'}:`;
    const currentIds = new Set(windows.map(w => w.id));

    // Close BrowserWindows for windows that no longer exist on the remote
    for (const [key, bw] of remoteWindows) {
        if (!key.startsWith(prefix)) continue;
        const windowId = key.slice(prefix.length);
        if (!currentIds.has(windowId) && !bw.isDestroyed()) {
            bw.close();
        }
    }

    // Open new windows
    const windowMap = new Map(windows.map(w => [w.id, w]));
    for (const w of windows) {
        const key = windowKey(fingerprint, w.id);
        if (remoteWindows.has(key)) continue;
        if (isTooSmall(w)) continue;

        const parentRemote = w.parentWindowId ? windowMap.get(w.parentWindowId) : undefined;
        createRemoteWindow(w, fingerprint, appId, parentRemote);
    }
}
