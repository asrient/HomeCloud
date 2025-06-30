import { Service, serviceStartMethod, serviceStopMethod, exposed } from "./primatives";
import { FsDriver } from "../files/fsDriver";
import ConfigStorage from "../storage";
import { StoreNames, PinnedFolder, SignalEvent, RemoteItem } from "../types";
import Signal from "../signals";

const PINNED_FOLDERS_KEY = "pinnedFolders";

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

    @exposed
    public move(remoteFingerprint: string | null, remoteFolderId: string, localFilePaths: string[], deleteSource = false): Promise<RemoteItem[]> {
        //return this.fs.copyFiles(remoteFingerprint, remoteFolderId, localFilePaths, deleteSource);
        throw new Error("Method not implemented.");
    }

    @exposed
    public download(remoteFingerprint: string | null, remotePath: string): Promise<void> {
        throw new Error("Method not implemented.");
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
            name = path.split(this.separator).pop() || 'Pinned Folder';
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

    @serviceStartMethod
    public async start() {
    }

    @serviceStopMethod
    public async stop() {
    }
}

export { FsDriver } from "../files/fsDriver";
