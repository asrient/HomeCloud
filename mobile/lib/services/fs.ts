import { FsDriver } from "shared/fsDriver";
import { FileContent, RemoteItem } from "shared/types";
import { exposed } from "shared/servicePrimatives";
import { File, Paths, Directory } from 'expo-file-system/next';
import * as FileSystem from 'expo-file-system/legacy';
import { getDrivesMapping, pathToUri, uriToPath } from "./fileUtils";


export default class MobileFsDriver extends FsDriver {

  private getItem(uri: string): File | Directory {
    const directory = new Directory(uri);
    if (directory.exists) {
      return directory;
    }
    return new File(uri);
  }

  async toRemoteItem(options: {
    item: string | File | Directory;
    name?: string;
    mimeType?: string;
    loadStat?: boolean;
  }): Promise<RemoteItem> {
    const { item: itemInput, name, mimeType, loadStat = false } = options;
    const item = typeof itemInput === 'string' ? this.getItem(itemInput) : itemInput;
    let uri = item.uri;
    let name_ = name || item.name;
    let size = item instanceof File ? item.size : 0;
    let mimeType_ = mimeType || (item instanceof File ? item.type : null);
    let modificationTime = new Date();

    if (loadStat) {
      try {
        const stat = await FileSystem.getInfoAsync(uri);
        if (stat.exists) {
          size = stat.size;
          modificationTime = new Date(stat.modificationTime * 1000);
        }
      } catch (error) {
        console.error('Error getting file info:', error);
      }
    }

    return {
      type: item instanceof Directory ? "directory" : "file",
      name: name_,
      path: uriToPath(uri),
      size,
      lastModified: modificationTime,
      createdAt: modificationTime,
      mimeType: mimeType_,
      etag: '',
      thumbnail: null,
    };
  }

  private normalizeFilename(name: string): string {
    if (name.includes('/') || name.includes('\\')) {
      throw new Error(`Invalid filename: ${name}`);
    }
    return name;
  }

  private async listDrives(): Promise<RemoteItem[]> {
    // On mobile, we don't have traditional "drives"
    const drivesMapping = getDrivesMapping();
    const items: RemoteItem[] = [];
    for (const [key, value] of Object.entries(drivesMapping)) {
      const remoteItem = await this.toRemoteItem({
        item: value,
        name: key,
        mimeType: 'application/x-drive'
      });
      items.push(remoteItem);
    }
    return items;
  }

  @exposed
  public override async readDir(dirPath: string) {
    // Handling special case of '' for drive listing.
    if (dirPath === '') {
      return this.listDrives();
    }
    dirPath = pathToUri(dirPath);

    try {
      const contents = await FileSystem.readDirectoryAsync(dirPath);
      const promises = contents.map((fileName: string) =>
        this.toRemoteItem({ item: Paths.join(dirPath, fileName) })
      );
      const results = await Promise.allSettled(promises);
      const items: RemoteItem[] = [];
      results.forEach((result: PromiseSettledResult<RemoteItem>) => {
        if (result.status === "fulfilled") {
          items.push(result.value);
        } else {
          console.error(`Error reading file: ${dirPath}`, result.reason);
        }
      });
      return items;
    } catch (error) {
      console.error('Error reading directory:', error);
      return [];
    }
  }

  @exposed
  public override async mkDir(name: string, baseId: string) {
    baseId = pathToUri(baseId);
    const dirPath = Paths.join(baseId, this.normalizeFilename(name));
    const directory = new Directory(dirPath);
    directory.create();
    return this.toRemoteItem({ item: directory });
  }

  @exposed
  public override async unlink(id: string) {
    id = pathToUri(id);
    await FileSystem.deleteAsync(id);
  }

  @exposed
  public override async rename(id: string, newName: string) {
    id = pathToUri(id);
    const parentDir = this.pathToParentFolder(id);
    const newPath = Paths.join(parentDir, this.normalizeFilename(newName));
    await FileSystem.moveAsync({ from: id, to: newPath });
    return this.toRemoteItem({ item: newPath });
  }

  @exposed
  public override async writeFile(folderId: string, fileContent: FileContent) {
    folderId = pathToUri(folderId);
    const filePath = Paths.join(folderId, this.normalizeFilename(fileContent.name));

    // Convert stream to string for writing
    const file = new File(filePath);
    file.create({
      intermediates: true,
      overwrite: true
    });
    await fileContent.stream.pipeTo(file.writableStream());
    return this.toRemoteItem({ item: file });
  }

  @exposed
  public override async readFile(id: string): Promise<FileContent> {
    id = pathToUri(id);
    const file = new File(id);
    if (!file.exists) {
      throw new Error(`File not found: ${id}`);
    }
    console.log('Reading file:', id);
    const filename = file.name;
    const mimeType = file.type;
    const stream = file.readableStream();
    return {
      name: filename,
      mime: mimeType || 'application/octet-stream',
      stream: stream
    };
  }

  private pathToFilename(filePath: string) {
    return Paths.basename(filePath);
  }

  private pathToParentFolder(filePath: string) {
    return Paths.dirname(filePath);
  }

  @exposed
  public override async updateFile(id: string, file: FileContent): Promise<RemoteItem> {
    id = pathToUri(id);
    file.name = this.pathToFilename(id);
    return this.writeFile(this.pathToParentFolder(id), file);
  }

  @exposed
  public override async moveFile(id: string, destParentId: string, newFileName: string, deleteSource: boolean): Promise<RemoteItem> {
    id = pathToUri(id);
    destParentId = pathToUri(destParentId);
    const destPath = Paths.join(destParentId, this.normalizeFilename(newFileName));

    if (deleteSource) {
      await FileSystem.moveAsync({ from: id, to: destPath });
    } else {
      await FileSystem.copyAsync({ from: id, to: destPath });
    }
    return this.toRemoteItem({ item: destPath });
  }

  @exposed
  public override async moveDir(id: string, destParentId: string, newDirName: string, deleteSource: boolean): Promise<RemoteItem> {
    id = pathToUri(id);
    destParentId = pathToUri(destParentId);
    return this.moveFile(id, destParentId, newDirName, deleteSource);
  }

  @exposed
  public override async getStat(id: string): Promise<RemoteItem> {
    id = pathToUri(id);
    return this.toRemoteItem({ item: id, loadStat: true });
  }
}
