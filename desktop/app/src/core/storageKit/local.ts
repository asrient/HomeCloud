import fs from "fs/promises";
import path from "path";
import { FsDriver, RemoteItem } from "./interface";
import { ApiRequestFile } from "../interface";
import { ReadStream } from "fs";
import { createReadStream } from "fs";
import { StorageType } from "../envConfig";
import { Readable } from "stream";
import { getMimeType, getNativeDrives } from "../utils/fileUtils";

export class LocalFsDriver extends FsDriver {
  override storageType = StorageType.Local;

  // todo: remove this
  hasAccess(filePath: string) {
    return true;
  }

  assertAccess(filePath: string) {
    if (!this.hasAccess(filePath)) {
      throw new Error(`Access denied: ${filePath}`);
    }
  }

  normalizePath(filePath: string) {
    if (!path.isAbsolute(filePath)) {
      throw new Error(`Relative paths not allowed: ${filePath}`);
    }
    return filePath;
  }

  isPathRoot(filePath: string) {
    return path.dirname(filePath) === filePath;
  }

  async toRemoteItem(filePath: string, name: string = null, mimeType: string = null, noParent = false): Promise<RemoteItem> {
    const stat = await fs.stat(filePath);
    const isDir = stat.isDirectory();
    if (!mimeType) {
      mimeType = getMimeType(filePath, isDir);
    }
    const fileId = filePath;
    const parentId = this.pathToParentFolder(fileId);
    return {
      type: isDir ? "directory" : "file",
      name: name || this.pathToFilename(filePath),
      id: fileId,
      parentIds: (noParent || this.isPathRoot(filePath)) ? null : [parentId],
      size: stat.size,
      lastModified: new Date(stat.mtimeMs),
      createdAt: new Date(stat.ctimeMs),
      mimeType,
      etag: '',
      thumbnail: null,
    };
  }

  normalizeFilename(name: string): string {
    if (name.includes('/')) {
      throw new Error(`Invalid filename: ${name}`);
    }
    return name;
  }

  async listDrives(): Promise<RemoteItem[]> {
    const drives = await getNativeDrives();
    const promises = Object.entries(drives).map(([key, value]) => {
      return this.toRemoteItem(value, key, 'application/x-drive', true);
    });
    return Promise.all(promises);
  }

  public override async readDir(dirPath: string) {
    // Handling special case of '' for drive listing.
    if (dirPath === '') {
      return this.listDrives();
    }
    dirPath = this.normalizePath(dirPath);
    this.assertAccess(dirPath);
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

  public override async mkDir(name: string, baseId: string) {
    baseId = this.normalizePath(baseId);
    this.assertAccess(baseId);
    const dirPath = `${baseId}/${this.normalizeFilename(name)}`;
    await fs.mkdir(dirPath);
    return this.toRemoteItem(dirPath);
  }

  public override async unlink(id: string) {
    id = this.normalizePath(id);
    this.assertAccess(id);
    await fs.unlink(id);
  }

  public override async rename(id: string, newName: string) {
    id = this.normalizePath(id);
    this.assertAccess(id);
    const parentDir = this.pathToParentFolder(id);
    const newPath = path.join(parentDir, this.normalizeFilename(newName));
    await fs.rename(id, newPath);
    return this.toRemoteItem(newPath);
  }

  public override async writeFile(
    folderId: string,
    file: ApiRequestFile,
    overwrite = false,
  ) {
    folderId = this.normalizePath(folderId);
    this.assertAccess(folderId);
    const filePath = path.join(folderId, this.normalizeFilename(file.name));
    const stream = file.stream as ReadStream;
    await fs.writeFile(filePath, stream);
    return this.toRemoteItem(filePath);
  }

  public override async readFile(id: string): Promise<[Readable, string]> {
    id = this.normalizePath(id);
    this.assertAccess(id);
    const mimeType = getMimeType(id);
    const stream = createReadStream(id);
    return [stream, mimeType];
  }

  pathToFilename(filePath: string) {
    return path.basename(filePath);
  }

  pathToParentFolder(filePath: string) {
    return path.dirname(filePath);
  }

  public override async updateFile(
    id: string,
    file: ApiRequestFile,
  ): Promise<RemoteItem> {
    id = this.normalizePath(id);
    this.assertAccess(id);
    file.name = this.pathToFilename(id);
    return this.writeFile(this.pathToParentFolder(id), file, true);
  }

  public override async moveFile(
    id: string,
    destParentId: string,
    newFileName: string,
    deleteSource: boolean,
  ): Promise<RemoteItem> {
    id = this.normalizePath(id);
    destParentId = this.normalizePath(destParentId);
    this.assertAccess(destParentId);
    this.assertAccess(id);
    const destPath = path.join(destParentId, this.normalizeFilename(newFileName));
    if (deleteSource) {
      await fs.rename(id, destPath);
    }
    else {
      await fs.copyFile(id, destPath);
    }
    return this.toRemoteItem(destPath);
  }

  public override async moveDir(
    id: string,
    destParentId: string,
    newDirName: string,
    deleteSource: boolean,
  ): Promise<RemoteItem> {
    id = this.normalizePath(id);
    destParentId = this.normalizePath(destParentId);
    this.assertAccess(destParentId);
    this.assertAccess(id);
    return this.moveFile(id, destParentId, newDirName, deleteSource);
  }

  public override async getStat(id: string): Promise<RemoteItem> {
    id = this.normalizePath(id);
    this.assertAccess(id);
    return this.toRemoteItem(id);
  }
}
