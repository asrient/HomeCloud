import { net, app, dialog, shell, MenuItemConstructorOptions } from 'electron';
import Signal from 'shared/signals';

const GITHUB_REPO = 'asrient/HomeCloud';
const DESKTOP_TAG_PREFIX = 'desktop-v';
const CHECK_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/desktop-latest`;

export interface UpdateInfo {
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
    releaseUrl: string;
    releaseName: string;
    releaseNotes: string;
}

export type UpdateStatus = 'available' | 'notavailable' | 'checking';

let cachedInfo: UpdateInfo | null = null;
let cachedAt = 0;
let checking = false;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Signal dispatched whenever the update status changes.
 * Listeners can use this to rebuild menus, update UI, etc.
 */
export const updateStatusChanged = new Signal<[UpdateStatus]>();

/**
 * Get the current status of the update check without triggering a fetch.
 */
export function getUpdateStatus(): UpdateStatus {
    if (checking) return 'checking';
    if (cachedInfo?.updateAvailable) return 'available';
    return 'notavailable';
}

function setChecking(value: boolean) {
    const wasBefore = getUpdateStatus();
    checking = value;
    const isNow = getUpdateStatus();
    if (wasBefore !== isNow) {
        updateStatusChanged.dispatch(isNow);
    }
}

/**
 * Check if updates are available from GitHub Releases.
 * @param force - If true, fetches from network even if cached info exists.
 * @returns UpdateInfo or null if check fails.
 */
export async function checkForUpdates(force = false): Promise<UpdateInfo | null> {
    if (!force && cachedInfo && (Date.now() - cachedAt) < CACHE_TTL) {
        return cachedInfo;
    }

    try {
        setChecking(true);
        const response = await net.fetch(CHECK_URL, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': `HomeCloud/${app.getVersion()}`,
            },
        });

        if (!response.ok) {
            console.warn(`Update check failed: ${response.status}`);
            return cachedInfo;
        }

        const release = await response.json();
        const versionMatch = (release.name || '').match(/desktop-v(.+)/);
        const latestVersion = versionMatch ? versionMatch[1] : (release.tag_name || '').replace(DESKTOP_TAG_PREFIX, '');
        const currentVersion = app.getVersion();

        cachedInfo = {
            currentVersion,
            latestVersion,
            updateAvailable: isNewer(latestVersion, currentVersion),
            releaseUrl: release.html_url,
            releaseName: release.name || latestVersion,
            releaseNotes: release.body || '',
        };
        cachedAt = Date.now();

        return cachedInfo;
    } catch (err) {
        console.warn('Update check error:', err);
        return cachedInfo;
    } finally {
        setChecking(false);
    }
}

/**
 * Compare semver strings. Returns true if latest > current.
 */
function isNewer(latest: string, current: string): boolean {
    const parse = (v: string) => v.split('.').map(Number);
    const l = parse(latest);
    const c = parse(current);
    for (let i = 0; i < Math.max(l.length, c.length); i++) {
        const lv = l[i] || 0;
        const cv = c[i] || 0;
        if (lv > cv) return true;
        if (lv < cv) return false;
    }
    return false;
}

/**
 * Show a dialog prompting the user to download the latest version.
 */
export async function showUpdateDialog() {
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

/**
 * Build a MenuItemConstructorOptions for the "Check for Updates" action.
 * Shared by both the app menu and the tray menu.
 */
export function getUpdateMenuItem(): MenuItemConstructorOptions {
    const status = getUpdateStatus();

    if (status === 'checking') {
        return { label: 'Checking for Updates…', enabled: false };
    }

    if (status === 'available') {
        return {
            label: 'Update Available…',
            click: () => showUpdateDialog(),
        };
    }

    return {
        label: 'Check for Updates…',
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
            } else {
                dialog.showMessageBox({
                    type: 'info',
                    title: 'No Updates',
                    message: `You're up to date`,
                    detail: `${app.getName()} v${info.currentVersion} is the latest version.`,
                });
            }
        },
    };
}
