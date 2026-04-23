import path from "path";
import fs from "fs";
import { getPartionedTmpDir } from "nodeShared/utils";
import { watch, FSWatcher } from 'chokidar';
import ServiceController from "shared/controller";
import { getServiceController } from "shared/utils";
import { getFileContent } from "nodeShared/files/fileUtils";

async function prepareTmpDir() {
    const uuid = modules.crypto.uuid();
    const tmpDir = path.join(getPartionedTmpDir('Files'), uuid);
    await fs.promises.mkdir(tmpDir, { recursive: true });
    return tmpDir;
}

export class WatchedFile {
    static watchedFiles: WatchedFile[] = [];
    static WATCH_LIMIT = 20;
    static EXPIRY = 1000 * 60 * 60 * 1;

    targetFileId: string;
    targetServiceController: ServiceController;
    targetFingerprint: string | null;
    dir: string | null = null;
    tmpFile: string | null = null;
    lastModified: Date | null = null;
    expiryTimer: NodeJS.Timeout | null = null;
    watcher: FSWatcher | null = null;
    mimeType: string | null = null;
    /** Remote file hash at last load/refresh — used to detect remote changes
     *  and to skip the "save back?" prompt when the local file matches remote. */
    private remoteHash: string | null = null;
    /** Whether the remote device supports getFileHash. Checked once per instance. */
    private hashAvailable: boolean | null = null;

    private constructor(targetFileId: string, serviceController: ServiceController, targetFingerprint: string | null) {
        this.targetFileId = targetFileId;
        this.targetServiceController = serviceController;
        this.targetFingerprint = targetFingerprint;
        WatchedFile.watchedFiles.push(this);
    }

    static async start(targetFingerprint: string | null, targetFileId: string) {
        // check if the file is already being watched
        const id = WatchedFile.getId(targetFingerprint, targetFileId);
        const existing = WatchedFile.watchedFiles.find((f) => f.getId() === id);
        if (existing) {
            // Sanity check: ensure the tmp file still exists on disk. The watcher's
            // unlink handler should normally clean up, but events can be missed
            // (e.g. tmp dir wiped while app was sleeping). If stale, drop it and
            // fall through to create a fresh watch.
            let stillValid = false;
            if (existing.tmpFile) {
                try {
                    await fs.promises.access(existing.tmpFile, fs.constants.F_OK);
                    stillValid = true;
                } catch {
                    stillValid = false;
                }
            }
            if (stillValid) {
                console.debug('[WatchedFile] Already watched, refreshing contents.');
                try {
                    await existing.refreshContents();
                } catch (err) {
                    console.error('[WatchedFile] Failed to refresh contents:', err);
                    const localSc = modules.getLocalServiceController();
                    localSc.system.ask({
                        title: 'Could not refresh file',
                        description: `Failed to reload "${path.basename(existing.tmpFile!)}" from remote. The local copy may be outdated.`,
                        buttons: [{ text: 'OK', isDefault: true, onPress: () => { } }],
                    });
                }
                existing.renewExpiry();
                existing.openFile();
                return existing;
            }
            console.debug('[WatchedFile] Existing watch is stale (tmp file missing), recreating.');
            await existing.remove();
        }

        if (WatchedFile.watchedFiles.length >= WatchedFile.WATCH_LIMIT) {
            WatchedFile.watchedFiles[0].remove();
        }
        const serviceController = await getServiceController(targetFingerprint);
        const wf = new WatchedFile(targetFileId, serviceController, targetFingerprint);
        await wf.loadFile();
        return wf;
    }

    static getId(targetFingerprint: string | null, fileId: string) {
        return `${targetFingerprint}:${fileId}`;
    }

    getId() {
        return WatchedFile.getId(this.targetFingerprint, this.targetFileId);
    }

    async remove() {
        console.debug('[WatchedFile] Removing watched file.');
        if (this.watcher) {
            await this.watcher.close();
        }
        if (this.tmpFile) {
            fs.unlink(this.tmpFile, () => {
                if (this.dir) {
                    fs.rmdir(this.dir, () => { });
                }
            });
        }
        WatchedFile.watchedFiles = WatchedFile.watchedFiles.filter((f) => f !== this);
    }

    renewExpiry() {
        if (this.expiryTimer) {
            clearTimeout(this.expiryTimer);
        }
        this.expiryTimer = setTimeout(async () => {
            if (!this.tmpFile) {
                await this.remove();
                return;
            }
            // remove if not busy
            try {
                // Try to open the file to check if it's busy
                const fileHandle = await fs.promises.open(this.tmpFile, 'r+');
                await fileHandle.close(); // Close the file if it opens successfully
                await this.remove();
            } catch (err: any) {
                if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
                    console.debug('[WatchedFile] File is busy, renewing expiry.');
                    this.renewExpiry();
                } else {
                    console.error(`[WatchedFile] On expiry, file access error: ${err.message}`);
                    await this.remove();
                }
            }
        }, WatchedFile.EXPIRY);
    }

    private async fileChanged(_path: string, stats?: fs.Stats) {
        if (this.isDownloading) return;
        const mtime = stats?.mtime ?? new Date();
        if (this.lastModified && ((mtime.getTime() - this.lastModified.getTime()) < 1000)) {
            return;
        }
        this.renewExpiry();
        this.lastModified = mtime;
        // Compare local file hash against remote — if they match, this change
        // was from our own refreshContents/downloadToTmp write, not a user edit.
        if (this.remoteHash) {
            const localHash = await this.getLocalFileHash();
            if (localHash && localHash === this.remoteHash) {
                console.debug('[WatchedFile] Local matches remote, skipping save prompt.');
                return;
            }
        }
        this.saveChanges();
    }

    private fileUnlinked() {
        console.debug('[WatchedFile] Tmp file deleted externally, cleaning up:', this.tmpFile);
        // File was deleted outside of our control; drop the watcher and pending
        // save prompts. Don't attempt to remove the (already gone) tmp file.
        this.tmpFile = '';
        this.remove().catch((err) => {
            console.error('[WatchedFile] Error during cleanup after unlink:', err);
        });
    }

    private isSaving = false;
    saveChanges = () => {
        if (this.isSaving || !this.tmpFile) {
            return;
        }
        console.log('[WatchedFile] Saving local file to remote:', this.tmpFile);
        const localSc = modules.getLocalServiceController();
        localSc.system.ask({
            title: 'Save changes to the original file?',
            description: `You have made changes to a copy of "${path.basename(this.tmpFile)}", your changes will be lost if you don't save.`,
            buttons: [{
                text: 'Cancel',
                isDefault: true,
                onPress: async () => {
                    console.debug('[WatchedFile] Cancelled saving file.');
                }
            }, {
                text: 'Save',
                isHighlighted: true,
                onPress: () => {
                    this.writeToRemote();
                }
            }],
        })
    }

    writeToRemote = async () => {
        if (!this.tmpFile) {
            console.error('[WatchedFile] No tmp file to save.');
            return;
        }
        this.isSaving = true;
        try {
            const fileContent = getFileContent(this.tmpFile);
            const targetDir = path.dirname(this.targetFileId);
            const stat = await this.targetServiceController.files.fs.writeFile(targetDir, fileContent);
            this.lastModified = stat.lastModified ? new Date(stat.lastModified) : new Date();
            // Hash the local file so the watcher knows local and remote are in sync.
            this.remoteHash = await this.getLocalFileHash();
            console.log('[WatchedFile] Saved file to remote.');
        } catch (e) {
            console.error('[WatchedFile] Error saving file to remote:', e);
            const localSc = modules.getLocalServiceController();
            localSc.system.ask({
                title: `Could not save file "${path.basename(this.tmpFile)}"`,
                description: 'There was a problem saving the file. Would you like to try again?',
                buttons: [{
                    text: 'Cancel',
                    isDefault: true,
                    onPress: () => {
                        console.debug('[WatchedFile] Cancelled saving file.');
                    }
                }, {
                    text: 'Try again',
                    isHighlighted: true,
                    onPress: () => {
                        this.writeToRemote();
                    }
                }]
            });

        } finally {
            this.isSaving = false;
        }
    }

    private isDownloading = false;
    /** Download the remote file to the local tmp path and update metadata + hash.
     *  If `existingStat` is provided, skips the remote getStat call. */
    private async downloadToTmp(existingStat?: { lastModified?: Date | null; mimeType?: string | null }) {
        if (this.isDownloading) {
            console.warn('[WatchedFile] Already downloading, skipping duplicate download request.');
            return;
        }
        this.isDownloading = true;
        try {
            if (!this.tmpFile) throw new Error('No tmp file path set');
            const fetches: [Promise<any>, Promise<any> | null] = [
                this.targetServiceController.files.fs.readFile(this.targetFileId),
                existingStat ? null : this.targetServiceController.files.fs.getStat(this.targetFileId),
            ];
            const [fileContent, fetchedStat] = await Promise.all(fetches);
            const stat = existingStat ?? fetchedStat;
            await fs.promises.writeFile(this.tmpFile, fileContent.stream);
            this.lastModified = stat.lastModified ? new Date(stat.lastModified) : new Date();
            this.mimeType = stat.mimeType || this.mimeType;
            this.remoteHash = await this.getLocalFileHash();
        } finally {
            this.isDownloading = false;
        }
    }

    /** Re-fetch the file from remote if its content has changed.
     *  Uses getFileHash to avoid downloading unchanged files and to
     *  let the change handler distinguish our write from user edits. */
    async refreshContents() {
        if (!this.tmpFile) {
            console.error('[WatchedFile] No tmp file to refresh.');
            return;
        }

        if (await this.isHashAvailable()) {
            const newRemoteHash = await this.targetServiceController.files.fs.getFileHash(this.targetFileId);
            if (this.remoteHash && newRemoteHash === this.remoteHash) {
                return;
            }
        }

        await this.downloadToTmp();
    }

    async loadFile() {
        const stat = await this.targetServiceController.files.fs.getStat(this.targetFileId);
        this.dir = await prepareTmpDir();
        this.tmpFile = path.join(this.dir, stat.name);
        try {
            await this.downloadToTmp(stat);
            this.renewExpiry();
            this.watcher = watch(this.tmpFile, {
                interval: 1000,
                binaryInterval: 2000,
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: 5000,
                    pollInterval: 1000
                }
            });
            this.watcher.on('change', this.fileChanged.bind(this));
            this.watcher.on('unlink', this.fileUnlinked.bind(this));
            this.openFile();
        } catch (e) {
            console.error(e);
            await this.remove();
            throw e;
        }
    }

    openFile() {
        if (!this.tmpFile) {
            console.error('[WatchedFile] No tmp file to open.');
            return;
        }
        const localSc = modules.getLocalServiceController();
        localSc.system.openFile(this.tmpFile);
    }

    // ── Hash helpers ──

    private async isHashAvailable(): Promise<boolean> {
        if (this.hashAvailable !== null) return this.hashAvailable;
        try {
            this.hashAvailable = await this.targetServiceController.app.isMethodAvailable('files.fs.getFileHash');
        } catch {
            this.hashAvailable = false;
        }
        return this.hashAvailable;
    }

    /** Hash the local tmp file using the local device's getFileHash. */
    private async getLocalFileHash(): Promise<string | null> {
        if (!this.tmpFile) return null;
        const localSc = modules.getLocalServiceController();
        try {
            return await localSc.files.fs.getFileHash(this.tmpFile);
        } catch (e) {
            console.debug('[WatchedFile] Failed to hash local file, getFileHash may not be available.', e);
            return null;
        }
    }
}
