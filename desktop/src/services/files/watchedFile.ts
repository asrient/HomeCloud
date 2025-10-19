import path from "path";
import fs from "fs";
import { getPartionedTmpDir } from "../../utils";
import { watch, FSWatcher } from 'chokidar';
import ServiceController from "shared/controller";
import { getServiceController } from "shared/utils";
import { getFileContent } from "./fileUtils";

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
    dir: string;
    tmpFile: string;
    lastModified: Date;
    expiryTimer: NodeJS.Timeout;
    watcher: FSWatcher;
    mimeType: string;

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
            console.log('File already being watched. renewing expiry.');
            existing.renewExpiry();
            existing.openFile();
            return existing;
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
        console.log('Removing watched file', this.tmpFile);
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
            // remove if not busy
            try {
                // Try to open the file to check if it’s busy
                const fileHandle = await fs.promises.open(this.tmpFile, 'r+');
                await fileHandle.close(); // Close the file if it opens successfully
                await this.remove();
            } catch (err) {
                if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
                    console.log('File is busy. renewing expiry.');
                    this.renewExpiry();
                } else {
                    console.error(`On expiry, file access error: ${err.message}`);
                    await this.remove();
                }
            }
        }, WatchedFile.EXPIRY);
    }

    private fileChanged(_path: string, stats: fs.Stats) {
        console.log('File changed', this.tmpFile, stats.mtime);
        this.lastModified = stats.mtime;
        this.renewExpiry();
        this.saveChanges();
    }

    private isSaving = false;
    saveChanges = () => {
        if (this.isSaving) {
            return;
        }
        console.log('Saving file', this.tmpFile);
        const localSc = modules.getLocalServiceController();
        localSc.system.ask({
            title: 'Save changes to the original file?',
            description: `You have made changes to a copy of "${path.basename(this.tmpFile)}", your changes will be lost if you don't save.`,
            buttons: [{
                text: 'Cancel',
                isDefault: true,
                onPress: async () => {
                    console.log('Cancelled saving file');
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
        this.isSaving = true;
        try {
            const fileContent = getFileContent(this.tmpFile);
            const targetDir = path.dirname(this.targetFileId);
            const stat = await this.targetServiceController.files.fs.writeFile(targetDir, fileContent);
            this.lastModified = stat.lastModified;
            console.log('Saved file to remote');
        } catch (e) {
            console.error('Error saving file to remote', e);
            const localSc = modules.getLocalServiceController();
            localSc.system.ask({
                title: `Could not saving file "${path.basename(this.tmpFile)}"`,
                description: 'There was an problem saving the file. Would you like to try again?',
                buttons: [{
                    text: 'Cancel',
                    isDefault: true,
                    onPress: () => {
                        console.log('Cancelled saving file');
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

    async loadFile() {
        const stat = await this.targetServiceController.files.fs.getStat(this.targetFileId);
        this.lastModified = stat.lastModified;
        this.mimeType = stat.mimeType;
        const filename = stat.name;
        this.dir = await prepareTmpDir();
        this.tmpFile = path.join(this.dir, filename);
        try {
            const fileContent = await this.targetServiceController.files.fs.readFile(this.targetFileId);
            await fs.promises.writeFile(this.tmpFile, fileContent.stream);
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
            this.openFile();
        } catch (e) {
            console.error(e);
            await this.remove();
            throw e;
        }
    }

    openFile() {
        const localSc = modules.getLocalServiceController();
        localSc.system.openFile(this.tmpFile);
    }
}
