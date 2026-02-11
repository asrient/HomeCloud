import { File, Directory, Paths } from 'expo-file-system/next';

type CacheEntry = {
    id: string;
    /** Path to the cached file */
    path: string;
};

const DEFAULT_MAX_ITEMS = 15;

/**
 * A simple LRU file cache backed by a directory on disk.
 * 
 * - Each entry is stored under `<cacheDir>/<id>/`.
 * - On `start()`, the entire cache directory is wiped and recreated.
 * - When the cache exceeds `maxItems`, the least-recently-used entry is evicted.
 * - `log(id, filePath)` registers a file in the cache (file can live anywhere; only tracked).
 * - `get(id)` returns the cached file path if it still exists on disk, or `null`.
 *   Accessing an entry promotes it to most-recently-used.
 */
export class FileCache {
    private entries: CacheEntry[] = []; // ordered: oldest first, newest last
    private cacheDir: string;
    private maxItems: number;
    private name: string;

    constructor(name: string, opts?: { maxItems?: number }) {
        this.name = name;
        this.maxItems = opts?.maxItems ?? DEFAULT_MAX_ITEMS;
        this.cacheDir = Paths.join(Paths.cache, name);
    }

    /**
     * Wipe and recreate the cache directory. Call on service start.
     */
    start() {
        const dir = new Directory(this.cacheDir);
        if (dir.exists) {
            dir.delete();
        }
        dir.create({ intermediates: true, idempotent: true });
        this.entries = [];
        console.log(`FileCache (${this.name}) location:`, this.cacheDir);
    }

    /**
     * Returns the cache base directory path.
     */
    get dir() {
        return this.cacheDir;
    }

    /**
     * Register a cached file. If the id already exists, it is promoted to most-recent.
     * Evicts the least-recently-used entry when over `maxItems`.
     */
    log(id: string, filePath: string) {
        // make sure the file is inside the cache directory
        if (!filePath.startsWith(this.cacheDir)) {
            console.warn(`FileCache (${this.name}) logged an external file: ${filePath}`);
        }
        // Remove existing entry with same id (will re-add at end)
        this.entries = this.entries.filter(e => e.id !== id);
        this.entries.push({ id, path: filePath });

        // Evict oldest entries if over limit
        while (this.entries.length > this.maxItems) {
            const evicted = this.entries.shift();
            if (evicted) {
                this.deleteEntry(evicted);
            }
        }
    }

    /**
     * Retrieve a cached file path by id. Returns `null` if not found or file no longer exists.
     * Promotes the entry to most-recently-used on access.
     */
    get(id: string): string | null {
        const idx = this.entries.findIndex(e => e.id === id);
        if (idx === -1) return null;

        const entry = this.entries[idx];
        const file = new File(entry.path);
        if (!file.exists) {
            // File gone from disk — remove from tracking
            this.entries.splice(idx, 1);
            return null;
        }

        // Promote to most-recently-used
        this.entries.splice(idx, 1);
        this.entries.push(entry);
        return entry.path;
    }

    /**
     * Check if an entry exists in the cache (without promoting it).
     */
    has(id: string): boolean {
        return this.entries.some(e => e.id === id);
    }

    private deleteEntry(entry: CacheEntry) {
        try {
            // Delete the file if it still exists
            const file = new File(entry.path);
            if (file.exists) {
                file.delete();
                console.log(`FileCache (${this.name}) evicted:`, entry.path);
            }
        } catch {
            // Ignore deletion errors
        }
    }
}
