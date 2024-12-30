import { Sequelize } from "sequelize";
import { InfoRepository, PhotoRepository } from "./repository";
import { verbose } from "sqlite3";
import path from "node:path";
import { envConfig } from "../../envConfig";
import fs from "fs";
import mime from "mime";
import { AssetDetailType, createPhotoType } from "./types";
import AssetManager from "./assetManager";
import { getPhotosParams, DeleteResponse } from "./types";
import { FSWatcher } from "node:fs";

const fsPromises = fs.promises;

const PHOTOS_DB_NAME = '.PhotosLibrary';

type createPhoto_ = {
    directory: string;
    filename: string;
    detail: AssetDetailType;
    mime: string;
    size: number;
};

export class PhotoLibrary {
    private location: string;
    private db: Sequelize;
    private repo: PhotoRepository;
    private infoRepo: InfoRepository;
    private lastUpdate: Date;
    private isMounted: boolean = false;
    private watcher: FSWatcher;
    private assetManager: AssetManager;
    private firstScan: boolean = true;
    private firstScanDirMtime: Date;

    constructor(location: string) {
        this.location = location;
        this.assetManager = new AssetManager(location);
    }

    isDeltaNegligible(a: Date, b: Date, threshold = 1000) {
        return Math.abs(a.getTime() - b.getTime()) < threshold;
    }

    public async mount() {
        if (this.isMounted) {
            return;
        }
        console.log("📸 Initializing Photo Library at:", this.location);
        this.firstScan = true;
        const stats = await fsPromises.stat(this.location);
        this.firstScanDirMtime = stats.mtime;
        this.db = new Sequelize({
            dialect: "sqlite",
            storage: path.join(this.location, PHOTOS_DB_NAME),
            dialectModule: verbose(),
            logging: envConfig.IS_DEV,
        });
        await this.db.authenticate();
        console.log("📸 Photo Library DB Connection established.");
        this.repo = new PhotoRepository(this.db, this.location);
        this.infoRepo = new InfoRepository(this.db);
        await this.db.sync();

        this.lastUpdate = (await this.infoRepo.getLastUpdate()) || new Date(0);
        const lastVersion = await this.infoRepo.getVersion();
        if (!lastVersion) {
            this.infoRepo.setVersion(envConfig.VERSION);
        }
        console.log("📸 Last Version:", lastVersion);
        await this.searchUpdatedFiles();
        this.startWatching();
        this.isMounted = true;
    }

    get isLibraryMounted() {
        return this.isMounted;
    }

    public async eject() {
        console.log("📸 Ejecting Photo Library at:", this.location);
        this.watcher.close();
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            await this.batchProcessUpdates();
        }
        await this.db.close();
        this.isMounted = false;
    }

    private async setLastUpdateCounter(date: Date) {
        if (date <= this.lastUpdate) {
            return;
        }
        this.lastUpdate = date;
        await this.infoRepo.setLastUpdate(date);
    }

    validateAssetPath(path: string) {
        if (path.startsWith('.')) return false;
        const mimeType = mime.getType(path);
        if (!mimeType) return false;
        return this.validateMimeType(mimeType);
    }

    validateMimeType(mimeType: string) {
        return mimeType.startsWith('image') || mimeType.startsWith('video');
    }

    ignoreDirectory(dirPath: string) {
        const dirname = path.basename(dirPath);
        return dirname.startsWith('.');
    }

    /**
     * Recursively finds files that have been modified since the last update,
     * traversing only directories that have been modified.
     */
    async searchUpdatedFiles(): Promise<void> {
        console.log("📸 Searching for updated files starting from:", this.lastUpdate);
        const newFiles: string[] = [];
        const deletedFiles: string[] = [];
        const deletedDirs: string[] = [];
        let maxMtime = this.lastUpdate;

        const traverseDirectory = async (directoryPath: string, isRoot = false): Promise<void> => {
            if (!isRoot && this.ignoreDirectory(directoryPath)) return;

            let mtime: Date;
            if (this.firstScan && isRoot) {
                mtime = this.firstScanDirMtime;
                this.firstScan = false;
                this.firstScanDirMtime = null;
            } else {
                const stats = await fsPromises.stat(directoryPath);
                mtime = stats.mtime;
            }

            // Skip directories that haven't changed since lastUpdated
            if (mtime <= this.lastUpdate || this.isDeltaNegligible(mtime, this.lastUpdate, isRoot ? 1200 : 600)) {
                return;
            }
            console.log("📸 Traversing directory:", directoryPath, "Last Modified:", mtime);

            if (mtime > maxMtime) {
                maxMtime = mtime;
            }

            const relativeDirPath = path.relative(this.location, directoryPath);

            const trackedDirs = new Set<string>(await this.repo.getImmediateChildDirectories(relativeDirPath));

            const entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
            const allAssetFilenames = new Set<string>();

            const tasks = entries.map(async (entry) => {
                const filename = entry.name;
                const fullPath = path.join(directoryPath, filename);
                const relativePath = path.join(relativeDirPath, filename);
                if (entry.isFile() && this.validateAssetPath(fullPath)) {
                    allAssetFilenames.add(filename);
                } else if (entry.isDirectory()) {
                    trackedDirs.delete(relativePath);
                    await traverseDirectory(fullPath); // Recurse into subdirectory
                }
            });

            const result = await Promise.allSettled(tasks); // Wait for all tasks to complete

            // Log errors if any
            const failed = result.filter((r) => r.status === 'rejected');
            if (failed.length > 0) {
                console.error("Error traversing directory", directoryPath, failed);
            }

            // Add directories to global deletedDirs that have been deleted, i.e exists in DB but not on FS
            deletedDirs.push(...Array.from(trackedDirs));

            // Check for new files and deleted files by comparing with tracked filenames on DB
            const trackedFilenames = await this.repo.getFilenamesForDirectory(relativeDirPath);
            trackedFilenames.forEach((filename) => {
                if (allAssetFilenames.has(filename)) {
                    allAssetFilenames.delete(filename);
                } else {
                    deletedFiles.push(path.join(relativeDirPath, filename));
                }
            });
            Array.from(allAssetFilenames).forEach((filename) => {
                newFiles.push(path.join(relativeDirPath, filename));
            });
        }

        await traverseDirectory(this.location, true);
        console.log("📸 Found new files count:", newFiles.length);
        console.log("📸 Found deleted files count:", deletedFiles.length);

        if (newFiles.length === 0 && deletedFiles.length === 0 && this.isDeltaNegligible(maxMtime, this.lastUpdate)) return;
        await this.ingestUpdates({ deletedFiles, addedFiles: newFiles, deletedDirs }, maxMtime);
    }

    private async walkDirectory(dirRelativePath: string) {
        const fullDirPath = path.join(this.location, dirRelativePath);
        if (this.ignoreDirectory(fullDirPath)) return [];

        const entries = await fsPromises.readdir(fullDirPath, { withFileTypes: true });
        const files: string[] = [];
        const tasks = entries.map(async (entry) => {
            const relativePath = path.join(dirRelativePath, entry.name);
            if (entry.isFile() && this.validateAssetPath(relativePath)) {
                files.push(relativePath);
            } else if (entry.isDirectory()) {
                const children = await this.walkDirectory(relativePath);
                files.push(...children);
            }
        });
        await Promise.all(tasks);
        return files;
    }

    private handleFileChange = async (filename: string) => {
        if (filename === PHOTOS_DB_NAME) return;
        if (filename.startsWith('.')) return;

        const fullPath = path.join(this.location, filename);
        const relativePath = path.relative(this.location, fullPath);
        console.debug("📸 File changed:", filename);

        let stats: fs.Stats = null;
        try {
            stats = await fsPromises.stat(fullPath);
        } catch (e) {
            // Ignored
        }
        const isAssetFile = this.validateAssetPath(fullPath);
        const date = new Date();

        const params = { deletedFiles: [], addedFiles: [], deletedDirs: [] };

        if (!stats) {
            if (isAssetFile) {
                params.deletedFiles.push(relativePath);
            } else {
                params.deletedDirs.push(relativePath);
            }
        } else if (stats.isDirectory()) {
            // walk the directory and find all files
            const files = await this.walkDirectory(relativePath);
            params.addedFiles.push(...files);
        } else if (isAssetFile) {
            params.addedFiles.push(relativePath);
        }

        // check if params are empty
        if (params.deletedFiles.length === 0 && params.addedFiles.length === 0 && params.deletedDirs.length === 0) return;

        this.ingestUpdates(params, date);
    }

    private async startWatching() {
        // Using native FS watcher instead of chokidar for now due to issues with yode
        // https://github.com/yue/yode/issues/7

        this.watcher = fs.watch(this.location, { recursive: true }, async (eventType, filename) => {
            if (!filename || eventType === 'change') return;
            try {
                await this.handleFileChange(filename);
            } catch (e) {
                console.error("📸 Error handling file change:", filename, e);
            }
        });

        // Chokidar specific events:
        // this.watcher.on('add', (path_) => {
        //     console.debug("📸 File added:", path_);
        //     if (!this.validateAssetPath(path_)) return;
        //     path_ = path.relative(this.location, path_);
        //     this.ingestUpdates({ deletedFiles: [], addedFiles: [path_] }, new Date());
        // });
        // this.watcher.on('unlink', (path_) => {
        //     console.debug("📸 File deleted:", path_);
        //     if (!this.validateAssetPath(path_)) return;
        //     path_ = path.relative(this.location, path_);
        //     this.ingestUpdates({ deletedFiles: [path_], addedFiles: [] }, new Date());
        // });

        this.watcher.on('error', (err) => {
            console.error("📸 Watcher error:", err);
        });

        console.log("📸 Watching for changes in:", this.location);
    }

    private updatesQueue: { deletedFiles: string[], addedFiles: string[], deletedDirs: string[], timestamp: Date }[] = [];
    private batchTimeout: NodeJS.Timeout;

    private async ingestUpdates({ deletedFiles, addedFiles, deletedDirs }: { deletedFiles: string[], addedFiles: string[], deletedDirs: string[] }, lastUpdate: Date) {
        this.updatesQueue.push({ deletedFiles, addedFiles, timestamp: lastUpdate, deletedDirs });
        if (this.updatesQueue.length === 1) {
            this.batchTimeout = setTimeout(() => {
                this.batchProcessUpdates();
            }, 600);
        }
    }

    private async batchProcessUpdates() {
        const batch = this.updatesQueue;
        this.updatesQueue = [];
        console.log("📸 Processing batch updates:", batch);
        const deletedFiles = new Set<string>();
        const deletedDirs = new Set<string>();
        const addedFiles = new Set<string>();
        let maxMtime = this.lastUpdate;
        batch.forEach(({ deletedFiles: del, deletedDirs: delDirs, addedFiles: add, timestamp }) => {
            del.forEach((file) => {
                deletedFiles.add(file);
            });
            delDirs.forEach((dir) => {
                deletedDirs.add(dir);
            });
            add.forEach((file) => {
                addedFiles.add(file);
            });
            if (timestamp > maxMtime) {
                maxMtime = timestamp;
            }
        });
        this.setLastUpdateCounter(maxMtime);
        const del = Array.from(deletedFiles).map((file) => {
            const directory = path.dirname(file);
            const filename = path.basename(file);
            return { directory, filename };
        });
        if (del.length > 0) {
            try {
                await this.repo.deletePhotosByPath(Array.from(del));
            } catch (e) {
                console.error("Error deleting photos", e);
            }
        }

        const delDirs = Array.from(deletedDirs);
        if (delDirs.length > 0) {
            try {
                await this.repo.deletePhotosByDirectories(delDirs);
            } catch (e) {
                console.error("Error deleting photos dir", e);
            }
        }

        const add = Array.from(addedFiles);
        if (add.length > 0) {
            await this.createPhotos(add);
        }
    }

    private async createPhotos(add: string[]) {
        const photos: createPhoto_[] = [];

        const tasks = add.map(async (file) => {
            const directory = path.dirname(file);
            const filename = path.basename(file);
            const mimeType = mime.getType(file) || '';
            const detail = await this.assetManager.generateDetail(directory, filename, mimeType);
            const fullPath = path.join(this.location, directory, filename);
            const size = (await fsPromises.stat(fullPath)).size;
            photos.push({ directory, filename, detail, mime: mimeType, size });
        });

        const result = await Promise.allSettled(tasks);
        const failed = result.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
            console.error("Error generating detail for files", failed);
        }

        try {
            await this.repo.createPhotosBulk(photos.map(({ directory, filename, detail, mime, size }): createPhotoType => {
                return {
                    directory,
                    filename,
                    metadata: JSON.stringify(detail.metadata),
                    mimeType: mime,
                    capturedOn: detail.capturedOn,
                    width: detail.width || null,
                    height: detail.height || null,
                    size,
                    duration: detail.duration || null,
                    originDevice: detail.metadata ? detail.metadata.cameraModel : null,
                };
            }));
        } catch (e) {
            console.error("Error creating photos", e);
        }
    }

    private requireLibraryMounted() {
        if (!this.isMounted) {
            throw new Error("Library not mounted");
        }
    }

    public async getPhotos(params: getPhotosParams) {
        this.requireLibraryMounted();
        return (await this.repo.getPhotos(params)).map((p) => this.repo.getMinDetails(p));
    }

    public async getPhoto(id: number) {
        this.requireLibraryMounted();
        const photo = await this.repo.getPhoto(id);
        return photo ? this.repo.getMinDetails(photo) : null;
    }

    public async deletePhotos(ids: number[]): Promise<DeleteResponse> {
        this.requireLibraryMounted();
        const photos = await this.repo.getPhotosByIds(ids);
        const promises = photos.map(async (photo) => {
            await this.assetManager.delete(path.join(photo.parentDirectory || '', photo.directoryName), photo.filename);
            return photo.id;
        });
        const result = await Promise.allSettled(promises);
        const failed = result.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
            console.error("Error deleting photos", failed);
        }
        const success = result.filter((r) => r.status === 'fulfilled');
        const successIds = success.map((r) => r.value);
        const count = await this.repo.deletePhotos(successIds);
        return {
            deleteCount: count,
            deletedIds: successIds,
        };
    }
}
