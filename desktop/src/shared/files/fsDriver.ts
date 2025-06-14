import { exposed } from "../services/primatives";
import { RemoteItem, FileContent } from "../types";

export class FsDriver {

    @exposed
    public async readDir(id: string): Promise<RemoteItem[]> {
        throw new Error("Not implemented");
    }

    @exposed
    public async mkDir(name: string, baseId: string): Promise<RemoteItem> {
        throw new Error("Not implemented");
    }

    @exposed
    public async unlink(id: string): Promise<void> {
        throw new Error("Not implemented");
    }

    @exposed
    public async unlinkMultiple(ids: string[]): Promise<string[]> {
        const deleted: string[] = [];
        const promises = [];
        for (const id of ids) {
            promises.push(this.unlink(id).then(() => deleted.push(id)));
        }
        await Promise.all(promises);
        return deleted;
    }

    @exposed
    public async rename(id: string, newName: string): Promise<RemoteItem> {
        throw new Error("Not implemented");
    }

    @exposed
    public async writeFile(folderId: string, file: FileContent): Promise<RemoteItem> {
        throw new Error("Not implemented");
    }

    @exposed
    public async writeFiles(folderId: string, files: FileContent[]): Promise<RemoteItem[]> {
        const result: RemoteItem[] = [];
        const promises = [];
        for (const file of files) {
            promises.push(
                this.writeFile(folderId, file).then((item) => result.push(item)),
            );
        }
        await Promise.all(promises);
        return result;
    }

    @exposed
    public async updateFile(id: string, file: FileContent): Promise<RemoteItem> {
        throw new Error("Not implemented");
    }

    @exposed
    public async readFile(id: string): Promise<FileContent> {
        throw new Error("Not implemented");
    }

    @exposed
    public async moveFile(id: string, destParentId: string, newFileName: string, deleteSource: boolean): Promise<RemoteItem> {
        throw new Error("Not implemented");
    }

    @exposed
    public async moveDir(id: string, destParentId: string, newDirName: string, deleteSource: boolean): Promise<RemoteItem> {
        throw new Error("Not implemented");
    }

    @exposed
    public async getStat(id: string): Promise<RemoteItem> {
        throw new Error("Not implemented");
    }

    @exposed
    public async getStats(ids: string[]): Promise<{ [id: string]: RemoteItem }> {
        const result: { [id: string]: RemoteItem } = {};
        const promises = [];
        for (const id of ids) {
            promises.push(this.getStat(id).then((item) => (result[id] = item)));
        }
        await Promise.all(promises);
        return result;
    }

    @exposed
    public async getStatByFilename(filename: string, baseId: string): Promise<RemoteItem> {
        if (baseId === "/") {
            baseId = "";
        }
        const filePath = `${baseId}/${filename}`;
        return await this.getStat(filePath);
    }

    @exposed
    public async getIdByFilename(filename: string, baseId: string): Promise<string> {
        if (baseId === "/") {
            baseId = "";
        }
        return `${baseId}/${filename}`;
    }

    @exposed
    public async makeOrGetDir(name: string, baseId: string): Promise<RemoteItem> {
        try {
            return await this.getStatByFilename(name, baseId);
        } catch (e) {
            return this.mkDir(name, baseId);
        }
    }
}
