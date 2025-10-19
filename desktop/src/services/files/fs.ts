import fs from "fs/promises";
import path from "path";
import { FsDriver } from "shared/fsDriver";
import { FileContent, RemoteItem } from "shared/types";
import { getMimeType, getNativeDrives, getFileContent } from "./fileUtils";
import { exposed } from "shared/servicePrimatives";

export default class LocalFsDriver extends FsDriver {

  private normalizePath(filePath: string) {
    if(filePath.endsWith(':')) {
      // Special case for Windows drive letters
      filePath += path.sep;
    }
    if (!path.isAbsolute(filePath)) {
      throw new Error(`Relative paths not allowed: ${filePath}`);
    }
    return filePath;
  }

  async toRemoteItem(filePath: string, name: string = null, mimeType: string = null): Promise<RemoteItem> {
    const stat = await fs.stat(filePath);
    const isDir = stat.isDirectory();
    if (!mimeType) {
      mimeType = getMimeType(filePath, isDir);
    }
    const fileId = filePath;
    return {
      type: isDir ? "directory" : "file",
      name: name || this.pathToFilename(filePath),
      path: fileId,
      size: stat.size,
      lastModified: new Date(stat.mtimeMs),
      createdAt: new Date(stat.ctimeMs),
      mimeType,
      etag: '',
      thumbnail: null,
    };
  }

  private normalizeFilename(name: string): string {
    if (name.includes('/')) {
      throw new Error(`Invalid filename: ${name}`);
    }
    return name;
  }

  private async listDrives(): Promise<RemoteItem[]> {
    const drives = await getNativeDrives();
    const promises = Object.entries(drives).map(([key, value]) => {
      return this.toRemoteItem(value, key, 'application/x-drive');
    });
    return Promise.all(promises);
  }

  @exposed
  public override async readDir(dirPath: string) {
    // Handling special case of '' for drive listing.
    if (dirPath === '') {
      return this.listDrives();
    }
    dirPath = this.normalizePath(dirPath);
    const contents = await fs.readdir(dirPath);
    const promises = contents.map((fileName) => this.toRemoteItem(path.join(dirPath, fileName)));
    const results = await Promise.allSettled(promises);
    const items: RemoteItem[] = [];
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        items.push(result.value);
      } else {
        console.error(`Error reading file: ${dirPath}`, result.reason);
      }
    });
    return items;
  }

  @exposed
  public override async mkDir(name: string, baseId: string) {
    baseId = this.normalizePath(baseId);
    const dirPath = path.join(baseId, this.normalizeFilename(name));
    await fs.mkdir(dirPath);
    return this.toRemoteItem(dirPath);
  }

  @exposed
  public override async unlink(id: string) {
    id = this.normalizePath(id);
    await fs.unlink(id);
  }

  @exposed
  public override async rename(id: string, newName: string) {
    id = this.normalizePath(id);
    const parentDir = this.pathToParentFolder(id);
    const newPath = path.join(parentDir, this.normalizeFilename(newName));
    await fs.rename(id, newPath);
    return this.toRemoteItem(newPath);
  }

  @exposed
  public override async writeFile(folderId: string, file: FileContent) {
    folderId = this.normalizePath(folderId);
    const filePath = path.join(folderId, this.normalizeFilename(file.name));
    const stream = file.stream;
    await fs.writeFile(filePath, stream);
    return this.toRemoteItem(filePath);
  }

  @exposed
  public override async readFile(id: string): Promise<FileContent> {
    id = this.normalizePath(id);
    return getFileContent(id);
  }

  private pathToFilename(filePath: string) {
    return path.basename(filePath);
  }

  private pathToParentFolder(filePath: string) {
    return path.dirname(filePath);
  }

  @exposed
  public override async updateFile(id: string, file: FileContent): Promise<RemoteItem> {
    id = this.normalizePath(id);
    file.name = this.pathToFilename(id);
    return this.writeFile(this.pathToParentFolder(id), file);
  }

  @exposed
  public override async moveFile(id: string, destParentId: string, newFileName: string, deleteSource: boolean): Promise<RemoteItem> {
    id = this.normalizePath(id);
    destParentId = this.normalizePath(destParentId);
    const destPath = path.join(destParentId, this.normalizeFilename(newFileName));
    if (deleteSource) {
      await fs.rename(id, destPath);
    }
    else {
      await fs.copyFile(id, destPath);
    }
    return this.toRemoteItem(destPath);
  }

  @exposed
  public override async moveDir(id: string, destParentId: string, newDirName: string, deleteSource: boolean): Promise<RemoteItem> {
    id = this.normalizePath(id);
    destParentId = this.normalizePath(destParentId);
    return this.moveFile(id, destParentId, newDirName, deleteSource);
  }

  @exposed
  public override async getStat(id: string): Promise<RemoteItem> {
    id = this.normalizePath(id);
    return this.toRemoteItem(id);
  }
}
