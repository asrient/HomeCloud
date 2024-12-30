import path from "path";
import { FsDriver } from "../../storageKit/interface";
import { getDefaultDirectoriesCached } from "../../utils/deviceInfo";
import fs from "fs";
import { native } from "../../native";
import { getPartionedTmpDir } from "../../utils/fileUtils";
import { uuid } from "../../utils/cryptoUtils";
import { watch, FSWatcher } from 'chokidar';

export async function downloadFile(fsDriver: FsDriver, fileId: string) {
    const stat = await fsDriver.getStat(fileId);
    const fileName = stat.name;
    const [stream, mimeType] = await fsDriver.readFile(fileId);
    const downloadsDir = getDefaultDirectoriesCached().Downloads;
    let filePath = path.join(downloadsDir, fileName);
    let counter = 1;

    // Function to check if the file exists and generate a unique name if needed
    async function checkAndWrite() {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            const ext = path.extname(fileName);
            const base = path.basename(fileName, ext);
            const newFileName = `${base} (${counter})${ext}`;
            filePath = path.join(downloadsDir, newFileName);
            counter++;
            return checkAndWrite();
        } catch (e) {
            await fs.promises.writeFile(filePath, stream);
        }
    }
    await checkAndWrite();

    if (native) {
        native.open(downloadsDir);
    }
    return filePath;
}


async function prepareTmpDir() {
    const tmpDir = path.join(getPartionedTmpDir('Files'), uuid());
    await fs.promises.mkdir(tmpDir, { recursive: true });
    return tmpDir;
}

export class WatchedFile {
    static watchedFiles: WatchedFile[] = [];
    static WATCH_LIMIT = 20;
    static EXPIRY = 1000 * 60 * 60 * 1;

    targetFileId: string;
    targetParentId: string;
    fsDriver: FsDriver;
    dir: string;
    tmpFile: string;
    lastModified: Date;
    expiryTimer: NodeJS.Timeout;
    watcher: FSWatcher;
    mimeType: string;
    constructor(targetFileId: string, fsDriver: FsDriver) {
        this.targetFileId = targetFileId;
        this.fsDriver = fsDriver;
        WatchedFile.watchedFiles.push(this);
    }

    static async start(targetFileId: string, fsDriver: FsDriver) {
        // check if the file is already being watched
        const id = WatchedFile.getId(fsDriver.storage.id, targetFileId);
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
        const wf = new WatchedFile(targetFileId, fsDriver);
        await wf.loadFile();
        return wf;
    }

    static getId(storageId: number, fileId: string) {
        return `${storageId}:${fileId}`;
    }

    getId() {
        return WatchedFile.getId(this.fsDriver.storage.id, this.targetFileId);
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
        if (this.isSaving || !native) {
            return;
        }
        console.log('Saving file', this.tmpFile);
        native.ask({
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
            const stream = fs.createReadStream(this.tmpFile);
            const stat = await this.fsDriver.writeFile(this.targetParentId, {
                stream,
                name: path.basename(this.tmpFile),
                mime: this.mimeType || 'application/octet-stream',
            });
            this.lastModified = stat.lastModified;
            console.log('Saved file to remote');
        } catch (e) {
            console.error('Error saving file to remote', e);
            if (native) {
                native.ask({
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
            }
        } finally {
            this.isSaving = false;
        }
    }

    async loadFile() {
        const stat = await this.fsDriver.getStat(this.targetFileId);
        this.lastModified = stat.lastModified;
        this.mimeType = stat.mimeType;
        this.targetParentId = stat.parentIds[0];
        const filename = stat.name;
        this.dir = await prepareTmpDir();
        this.tmpFile = path.join(this.dir, filename);
        try {
            const [stream] = await this.fsDriver.readFile(this.targetFileId);
            await fs.promises.writeFile(this.tmpFile, stream);
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
        if (native) {
            native.open(this.tmpFile);
        }
    }
}
