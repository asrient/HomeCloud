import { File } from 'expo-file-system/next';
import { AppState, AppStateStatus } from 'react-native';
import ConfigStorage from 'shared/storage';

type CacheEntry = {
    /** Original file path (e.g., ph://...) */
    originalPath: string;
    /** Path to the converted cache file */
    cachePath: string;
};

const MAX_CACHE_SIZE = 25;
const CACHE_STORE_KEY = 'entries';

/**
 * Simple in-memory cache for converted preview files.
 * Tracks files created by ImageManipulator and removes old ones when limit is exceeded.
 * Persists cache details to config store when app goes to background.
 * On init, loads and clears any leftover cache from previous session.
 */
export class PreviewCache {
    private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
    store: ConfigStorage | null = null;

    /**
     * Initialize the cache. Call this after modules are ready.
     * Loads any leftover cache entries from previous session and clears them.
     */
    async start() {
        // Listen for app state changes
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
        try {
            this.store = modules.ConfigStorage.getInstance('preview_cache');
            await this.store.load();
        } catch {
            // Store not loaded yet or other error, ignore
        }
    }

    stop() {
        // Unsubscribe from app state changes
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }
    }

    private handleAppStateChange = (nextAppState: AppStateStatus) => {
        if (nextAppState === 'background' || nextAppState === 'inactive') {
            this.persistToStore().catch(() => {
                // Ignore errors
            });
        }
    };

    private getEntries(): CacheEntry[] {
        if (!this.store) return [];
        return this.store.getItem<CacheEntry[]>(CACHE_STORE_KEY) || [];
    }

    private async persistToStore() {
        if (!this.store) return;
        await this.store.save();
    }

    private setEntries(entries: CacheEntry[]) {
        if (!this.store) return;
        this.store.setItem(CACHE_STORE_KEY, entries);
    }

    /**
     * Get cached file path for an original path, if it exists
     */
    get(originalPath: string): string | null {
        const entry = this.getEntries().find(e => e.originalPath === originalPath);
        if (entry) {
            const file = new File(entry.cachePath);
            if (file.exists) {
                return entry.cachePath;
            }
            // File doesn't exist anymore, update cache
            this.setEntries(this.getEntries().filter(e => e.originalPath !== originalPath));
        }
        return null;
    }

    /**
     * Add a new cache entry. Automatically removes oldest entries if over limit.
     */
    add(originalPath: string, cachePath: string) {
        const entries = this.getEntries();
        console.log(`[PreviewCache] Adding cache entry. Original: ${originalPath}, Cache: ${cachePath}. Total entries before add: ${entries.length}`);
        entries.push({ originalPath, cachePath });
        // If over limit, remove oldest entries
        while (entries.length > MAX_CACHE_SIZE) {
            const entryToRemove = entries.shift();
            if (entryToRemove) {
                this.deleteFile(entryToRemove.cachePath);
            }
        }
        this.setEntries(entries);
    }

    private deleteFile(path: string) {
        try {
            const file = new File(path);
            if (file.exists) {
                console.log('[PreviewCache] Deleting cached preview file:', path);
                file.delete();
            }
        } catch {
            // Ignore deletion errors
        }
    }
}
