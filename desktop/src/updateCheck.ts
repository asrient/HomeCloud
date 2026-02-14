import { net } from 'electron';
import { app } from 'electron';

const GITHUB_REPO = 'asrient/HomeCloud';
const CHECK_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

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
 * Get the current status of the update check without triggering a fetch.
 */
export function getUpdateStatus(): UpdateStatus {
    if (checking) return 'checking';
    if (cachedInfo?.updateAvailable) return 'available';
    return 'notavailable';
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
        checking = true;
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
        const latestVersion = (release.tag_name || '').replace(/^v/, '');
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
        checking = false;
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
