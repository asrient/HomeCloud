import { exposed, info, input, output, wfApi } from "./servicePrimatives";
import { Sch, RemoteItem, RemoteItemSchema, FileContent, FileContentSchema } from "./types";

export class FsDriver {

    @exposed
    @wfApi
    @info("List files and folders in a directory")
    @input(Sch.String)
    @output(Sch.Array(RemoteItemSchema))
    public async readDir(id: string): Promise<RemoteItem[]> { return this._readDir(id); }

    @exposed
    @wfApi
    @info("Create a new directory")
    @input(Sch.String, Sch.String)
    @output(RemoteItemSchema)
    public async mkDir(name: string, baseId: string): Promise<RemoteItem> { return this._mkDir(name, baseId); }

    @exposed
    @wfApi
    @info("Delete a file or directory")
    @input(Sch.String)
    public async unlink(id: string): Promise<void> { return this._unlink(id); }

    @exposed
    @wfApi
    @info("Delete multiple files or directories")
    @input(Sch.StringArray)
    @output(Sch.StringArray)
    public async unlinkMultiple(ids: string[]): Promise<string[]> {
        const deleted: string[] = [];
        await Promise.all(ids.map(id => this._unlink(id).then(() => deleted.push(id))));
        return deleted;
    }
    @exposed
    @wfApi
    @info("Rename a file or directory")
    @input(Sch.String, Sch.String)
    @output(RemoteItemSchema)
    public async rename(id: string, newName: string): Promise<RemoteItem> { return this._rename(id, newName); }

    @exposed
    @wfApi
    @info("Write a file to a directory")
    @input(Sch.String, FileContentSchema)
    @output(RemoteItemSchema)
    public async writeFile(folderId: string, file: FileContent): Promise<RemoteItem> { return this._writeFile(folderId, file); }

    @exposed
    @wfApi
    @info("Write multiple files to a directory")
    @input(Sch.String, { type: 'array', items: FileContentSchema })
    @output(Sch.Array(RemoteItemSchema))
    public async writeFiles(folderId: string, files: FileContent[]): Promise<RemoteItem[]> {
        const result: RemoteItem[] = [];
        await Promise.all(files.map(file => this._writeFile(folderId, file).then(item => result.push(item))));
        return result;
    }

    @exposed
    @wfApi
    @info("Update an existing file's content")
    @input(Sch.String, FileContentSchema)
    @output(RemoteItemSchema)
    public async updateFile(id: string, file: FileContent): Promise<RemoteItem> { return this._updateFile(id, file); }

    @exposed
    @wfApi
    @info("Read a file's content")
    @input(Sch.String)
    @output(FileContentSchema)
    public async readFile(id: string): Promise<FileContent> { return this._readFile(id); }

    @exposed
    @wfApi
    @info("Move or copy a file to another directory")
    @input(Sch.String, Sch.String, Sch.String, Sch.Boolean)
    @output(RemoteItemSchema)
    public async moveFile(id: string, destParentId: string, newFileName: string, deleteSource: boolean): Promise<RemoteItem> { return this._moveFile(id, destParentId, newFileName, deleteSource); }

    @exposed
    @wfApi
    @info("Move or copy a directory to another location")
    @input(Sch.String, Sch.String, Sch.String, Sch.Boolean)
    @output(RemoteItemSchema)
    public async moveDir(id: string, destParentId: string, newDirName: string, deleteSource: boolean): Promise<RemoteItem> { return this._moveDir(id, destParentId, newDirName, deleteSource); }

    @exposed
    @wfApi
    @info("Get file or directory metadata")
    @input(Sch.String)
    @output(RemoteItemSchema)
    public async getStat(id: string): Promise<RemoteItem> { return this._getStat(id); }

    @exposed
    @info("Get metadata for multiple files or directories")
    @input(Sch.StringArray)
    public async getStats(ids: string[]): Promise<{ [id: string]: RemoteItem }> {
        const result: { [id: string]: RemoteItem } = {};
        await Promise.all(ids.map(id => this._getStat(id).then(item => (result[id] = item))));
        return result;
    }

    @exposed
    @wfApi
    @info("Get file metadata by filename within a directory")
    @input(Sch.String, Sch.String)
    @output(RemoteItemSchema)
    public async getStatByFilename(filename: string, baseId: string): Promise<RemoteItem> {
        if (baseId === "/") baseId = "";
        return this._getStat(`${baseId}/${filename}`);
    }

    @exposed
    @info("Resolve full path from filename and parent directory")
    @input(Sch.String, Sch.String)
    @output(Sch.String)
    public async getIdByFilename(filename: string, baseId: string): Promise<string> {
        if (baseId === "/") baseId = "";
        return `${baseId}/${filename}`;
    }

    @exposed
    @wfApi
    @info("Create a directory or return it if it already exists")
    @input(Sch.String, Sch.String)
    @output(RemoteItemSchema)
    public async makeOrGetDir(name: string, baseId: string): Promise<RemoteItem> {
        try { return await this.getStatByFilename(name, baseId); }
        catch { return this._mkDir(name, baseId); }
    }

    // --- Protected methods (override these in subclasses) ---

    protected async _readDir(id: string): Promise<RemoteItem[]> { throw new Error("Not implemented"); }
    protected async _mkDir(name: string, baseId: string): Promise<RemoteItem> { throw new Error("Not implemented"); }
    protected async _unlink(id: string): Promise<void> { throw new Error("Not implemented"); }
    protected async _rename(id: string, newName: string): Promise<RemoteItem> { throw new Error("Not implemented"); }
    protected async _writeFile(folderId: string, file: FileContent): Promise<RemoteItem> { throw new Error("Not implemented"); }
    protected async _updateFile(id: string, file: FileContent): Promise<RemoteItem> { throw new Error("Not implemented"); }
    protected async _readFile(id: string): Promise<FileContent> { throw new Error("Not implemented"); }
    protected async _moveFile(id: string, destParentId: string, newFileName: string, deleteSource: boolean): Promise<RemoteItem> { throw new Error("Not implemented"); }
    protected async _moveDir(id: string, destParentId: string, newDirName: string, deleteSource: boolean): Promise<RemoteItem> { throw new Error("Not implemented"); }
    protected async _getStat(id: string): Promise<RemoteItem> { throw new Error("Not implemented"); }

    public joinPaths(...paths: string[]): string {
        throw new Error("Not implemented");
    }
}
