import fs from "fs/promises";
import { createReadStream } from "fs";
import { createHash } from "crypto";
import path from "path";
import { FsDriver } from "shared/fsDriver";
import { FileContent, RemoteItem } from "shared/types";
import { getMimeType, getNativeDrives, getFileContent } from "./fileUtils";

export default class LocalFsDriver extends FsDriver {

  private normalizePath(filePath: string) {
    if (filePath.endsWith(':')) {
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

  
  protected override async _readDir(dirPath: string) {
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
        console.error(`[FilesService] Error reading directory.`, result.reason);
      }
    });
    return items;
  }

  
  protected override async _mkDir(name: string, baseId: string) {
    baseId = this.normalizePath(baseId);
    const dirPath = path.join(baseId, this.normalizeFilename(name));
    await fs.mkdir(dirPath, { recursive: false });
    return this.toRemoteItem(dirPath);
  }

  
  protected override async _unlink(id: string) {
    id = this.normalizePath(id);
    await fs.rm(id, { recursive: true, force: true });
  }

  
  protected override async _rename(id: string, newName: string) {
    id = this.normalizePath(id);
    const parentDir = this.pathToParentFolder(id);
    const newPath = path.join(parentDir, this.normalizeFilename(newName));
    await fs.rename(id, newPath);
    return this.toRemoteItem(newPath);
  }

  
  protected override async _writeFile(folderId: string, file: FileContent) {
    folderId = this.normalizePath(folderId);
    const filePath = path.join(folderId, this.normalizeFilename(file.name));
    const stream = file.stream;
    await fs.writeFile(filePath, stream);
    return this.toRemoteItem(filePath);
  }

  
  protected override async _readFile(id: string): Promise<FileContent> {
    id = this.normalizePath(id);
    return getFileContent(id);
  }

  private pathToFilename(filePath: string) {
    return path.basename(filePath);
  }

  private pathToParentFolder(filePath: string) {
    return path.dirname(filePath);
  }

  
  protected override async _updateFile(id: string, file: FileContent): Promise<RemoteItem> {
    id = this.normalizePath(id);
    file.name = this.pathToFilename(id);
    return this._writeFile(this.pathToParentFolder(id), file);
  }

  
  protected override async _moveFile(id: string, destParentId: string, newFileName: string, deleteSource: boolean): Promise<RemoteItem> {
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

  
  protected override async _moveDir(id: string, destParentId: string, newDirName: string, deleteSource: boolean): Promise<RemoteItem> {
    id = this.normalizePath(id);
    destParentId = this.normalizePath(destParentId);
    return this._moveFile(id, destParentId, newDirName, deleteSource);
  }

  
  protected override async _getStat(id: string): Promise<RemoteItem> {
    id = this.normalizePath(id);
    return this.toRemoteItem(id);
  }

  protected override async _getFileHash(id: string): Promise<string> {
    id = this.normalizePath(id);
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(id);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  public joinPaths(...paths: string[]): string {
    return path.join(...paths);
  }
}
