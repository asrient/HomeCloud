import { Service, serviceStartMethod, serviceStopMethod, exposed } from "./primatives";
import { FsDriver } from "../files/fsDriver";
import ConfigStorage from "../storage";
import { StoreNames, PinnedFolder } from "../types";

const PINNED_FOLDERS_KEY = "pinnedFolders";

export abstract class FilesService extends Service {
    protected store: ConfigStorage;

    public async init() {
        this._init();
        this.store = modules.ConfigStorage.getInstance(StoreNames.FILES);
        await this.store.load();
    }

    public fs: FsDriver;

    @exposed
    public async listPinnedFolders(): Promise<PinnedFolder[]> {
        return this.store.getItem(PINNED_FOLDERS_KEY) || [];
    }

    @exposed
    public async addPinnedFolder(path: string, name: string): Promise<PinnedFolder> {
        const pinnedFolders = await this.listPinnedFolders();
        const newPinnedFolder: PinnedFolder = { path, name };
        pinnedFolders.push(newPinnedFolder);
        this.store.setItem(PINNED_FOLDERS_KEY, pinnedFolders);
        await this.store.save();
        return newPinnedFolder;
    }

    @exposed
    public async removePinnedFolder(path: string): Promise<void> {
        const pinnedFolders = await this.listPinnedFolders();
        const updatedPinnedFolders = pinnedFolders.filter(folder => folder.path !== path);
        this.store.setItem(PINNED_FOLDERS_KEY, updatedPinnedFolders);
        await this.store.save();
    }

    @serviceStartMethod
    public async start() {
    }

    @serviceStopMethod
    public async stop() {
    }
}

export { FsDriver } from "../files/fsDriver";
