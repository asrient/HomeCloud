import { Service, serviceStartMethod, serviceStopMethod, exposed } from "./servicePrimatives";
import { FsDriver } from "./fsDriver";
import ConfigStorage from "./storage";
import { StoreNames, PinnedFolder, SignalEvent, RemoteItem, FileFilter, FileContent, PreviewOptions } from "./types";
import Signal from "./signals";
import { getServiceController } from "./utils"

const PINNED_FOLDERS_KEY = "pinnedFolders";
const SHARE_CACHE_DIRNAME = "ShareCache";

export abstract class FilesService extends Service {
    protected store: ConfigStorage;

    public async init() {
        this._init();
        this.store = modules.ConfigStorage.getInstance(StoreNames.FILES);
        await this.store.load();
    }

    public fs: FsDriver;

    public pinnedFoldersSignal = new Signal<[SignalEvent, PinnedFolder]>({ isExposed: true, isAllowAll: false });

    public separator = "/";

    protected async _moveSingle(remoteFingerprint: string | null, remoteFolderId: string, localFilePath: string, deleteSource: boolean): Promise<RemoteItem[]> {
        const fileStat = await this.fs.getStat(localFilePath);

        // Same-device move: use efficient filesystem-level move/copy
        if (remoteFingerprint === null) {
            if (fileStat.type === "directory") {
                const result = await this.fs.moveDir(localFilePath, remoteFolderId, fileStat.name, deleteSource);
                return [result];
            } else {
                const result = await this.fs.moveFile(localFilePath, remoteFolderId, fileStat.name, deleteSource);
                return [result];
            }
        }

        // Cross-device move: read from local fs, write to remote device
        if (fileStat.type === "directory") {
            const remoteDirName = localFilePath.split(this.separator).filter(Boolean).pop() || 'folder';
            const serviceController = await getServiceController(remoteFingerprint);
            const remoteDir = await serviceController.files.fs.mkDir(remoteDirName, remoteFolderId);
            const remoteDirPath = remoteDir.path;
            const files = await this.fs.readDir(localFilePath);
            const promises = files.map(async (file, ind) => {
                const filePath = file.path;
                if (ind > 0) {
                    await new Promise((resolve) => setTimeout(resolve, ind * 100));
                }
                return this._moveSingle(remoteFingerprint, remoteDirPath, filePath, deleteSource);
            });
            await Promise.allSettled(promises);
            if (deleteSource) {
                try {
                    await this.fs.unlink(localFilePath);
                } catch (e) {
                    console.error("Failed to delete source directory:", e);
                }
            }
            return [remoteDir];
        } else {
            const serviceController = await getServiceController(remoteFingerprint);
            const fileContent = await this.fs.readFile(localFilePath);
            const remoteItem = await serviceController.files.fs.writeFile(
                remoteFolderId,
                fileContent
            );
            if (deleteSource) {
                try {
                    await this.fs.unlink(localFilePath);
                } catch (e) {
                    console.error("Failed to delete source file:", e);
                }
            }
            return [remoteItem];
        }
    }

    @exposed
    public async move(remoteFingerprint: string | null, remoteFolderId: string, localFilePaths: string[], deleteSource = false): Promise<RemoteItem[]> {
        // make sure remoteFingerprint is accessible
        await getServiceController(remoteFingerprint);
        if (remoteFingerprint !== null) {
            // check if peer is added
            const localSc = modules.getLocalServiceController();
            const peer = localSc.app.getPeer(remoteFingerprint);
            if (!peer) {
                throw new Error(`Device "${remoteFingerprint}" is not paired.`);
            }
        }
        const results = await Promise.allSettled(localFilePaths.map(async (localFilePath) => {
            return this._moveSingle(remoteFingerprint, remoteFolderId, localFilePath, deleteSource);
        }));
        const items: RemoteItem[] = [];
        const errors: string[] = [];
        results.forEach(result => {
            if (result.status === "fulfilled") {
                items.push(...result.value);
            } else {
                console.error("Failed to move file:", result.reason);
                errors.push(result.reason?.message || String(result.reason));
            }
        });
        if (items.length === 0 && errors.length > 0) {
            throw new Error(`Move failed: ${errors[0]}`);
        }
        return items;
    }

    @exposed
    public async download(remoteFingerprint: string | null, remotePaths: string[]): Promise<void> {
        throw new Error("Method not implemented.");
    }

    /**
     * Get a preview of a file. By default, this just returns the file content.
     * Subclasses can override this to convert files (e.g., HEIC to JPEG) for preview.
     * @param filePath - Path to the file
     * @param opts - Preview options (e.g., supportsHeic to skip HEIC conversion)
     */
    @exposed
    public async getPreview(filePath: string, opts?: PreviewOptions): Promise<FileContent> {
        return this.fs.readFile(filePath);
    }

    protected abstract _openRemoteFile(remoteFingerprint: string, remotePath: string): Promise<void>;

    private getShareCacheDir() {
        return this.fs.joinPaths(modules.config.CACHE_DIR, SHARE_CACHE_DIRNAME);
    }

    private shareCacheCleanupTimer: any = null;

    private async clearShareCache() {
        const cacheDir = this.getShareCacheDir();
        await this.fs.unlink(cacheDir);
        // recreate the directory
        await this.fs.mkDir(SHARE_CACHE_DIRNAME, modules.config.CACHE_DIR);
    }

    public async shareFiles(fingerprint: string | null, paths: string[], forceCache?: boolean): Promise<void> {
        if (paths.length === 0) {
            throw new Error("No files to share.");
        }
        if (fingerprint === null && !forceCache) {
            this.shareLocalFiles(paths);
            return;
        }
        const serviceController = await getServiceController(fingerprint);
        if (this.shareCacheCleanupTimer !== null) {
            clearTimeout(this.shareCacheCleanupTimer);
            this.shareCacheCleanupTimer = null;
        }
        await this.clearShareCache();
        // todo: there is a potential issue of name collisions here.
        const createdItems = await serviceController.files.move(fingerprint === null ? null : modules.config.FINGERPRINT, this.getShareCacheDir(), paths, false);
        console.log("Created share cache items:", createdItems);
        const sharePaths = createdItems.map(item => item.path);
        this.shareLocalFiles(sharePaths);
        // start cleanup timer
        this.shareCacheCleanupTimer = setTimeout(() => {
            this.clearShareCache()
                .then(() => {
                    console.log("Share cache cleared.");
                })
                .catch((e) => {
                    console.error("Failed to clear share cache:", e);
                });
        }, 10 * 60 * 1000); // 10 minutes
    }

    public async shareLocalFiles(paths: string[]): Promise<void> {
        const localSc = modules.getLocalServiceController();
        localSc.system.share({
            title: "Share Files",
            files: paths,
            type: 'file'
        })
    }

    @exposed
    public async openFile(deviceFingerprint: string | null, path: string): Promise<void> {
        if (deviceFingerprint === null) {
            // its a local file, just open it.
            const localSc = modules.getLocalServiceController();
            localSc.system.openFile(path);
            return;
        }
        // create a watch file.
        await this._openRemoteFile(deviceFingerprint, path);
    }

    @exposed
    public async listPinnedFolders(): Promise<PinnedFolder[]> {
        return this.store.getItem(PINNED_FOLDERS_KEY) || [];
    }

    @exposed
    public async addPinnedFolder(path: string, name?: string): Promise<PinnedFolder> {
        const pinnedFolders = await this.listPinnedFolders();
        if (pinnedFolders.some(folder => folder.path === path)) {
            throw new Error(`Pinned folder with path "${path}" already exists.`);
        }
        if (!name) {
            const segment = path.split(this.separator).filter(Boolean).pop() || 'Pinned Folder';
            try { name = decodeURIComponent(segment); } catch { name = segment; }
        }
        const newPinnedFolder: PinnedFolder = { path, name };
        pinnedFolders.push(newPinnedFolder);
        this.store.setItem(PINNED_FOLDERS_KEY, pinnedFolders);
        await this.store.save();
        this.pinnedFoldersSignal.dispatch(SignalEvent.ADD, newPinnedFolder);
        return newPinnedFolder;
    }

    @exposed
    public async removePinnedFolder(path: string): Promise<void> {
        const pinnedFolders = await this.listPinnedFolders();
        const pin = pinnedFolders.find(folder => folder.path === path);
        if (!pin) {
            throw new Error(`Pinned folder with path "${path}" not found.`);
        }
        const updatedPinnedFolders = pinnedFolders.filter(folder => folder.path !== path);
        this.store.setItem(PINNED_FOLDERS_KEY, updatedPinnedFolders);
        await this.store.save();
        this.pinnedFoldersSignal.dispatch(SignalEvent.REMOVE, pin);
    }

    public async openFilePicker(selectMultiple: boolean, pickDir?: boolean, filters?: FileFilter[], title?: string, buttonText?: string): Promise<RemoteItem[] | null> {
        throw new Error("Method not implemented.");
    }

    @serviceStartMethod
    public async start() {
        await this.clearShareCache();
    }

    @serviceStopMethod
    public async stop() {
    }
}

export { FsDriver } from "./fsDriver";
