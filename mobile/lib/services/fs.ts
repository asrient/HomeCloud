import { FsDriver } from "shared/fsDriver";
import { FileContent, RemoteItem } from "shared/types";

import { File, Paths, Directory } from 'expo-file-system/next';
import * as FileSystem from 'expo-file-system/legacy';
import QuickCrypto from 'react-native-quick-crypto';
import { getDrivesMapping, pathToUri, uriToPath, getMimeType, resolveFileUri } from "./fileUtils";
import { MobilePlatform } from "../types";
import { fetch } from "expo/fetch";

const READ_CHUNK_SIZE = 256 * 1024; // 256KB chunks for fewer framing iterations

/**
 * Creates a ReadableStream from a File using FileHandle.readBytes() with
 * a configurable chunk size. Expo's built-in readableStream() uses 1KB chunks,
 * which is far too small for efficient network transfer.
 */
function createFileReadStream(file: File): ReadableStream<Uint8Array> {
  const handle = file.open();
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const bytes = handle.readBytes(READ_CHUNK_SIZE);
      if (bytes.byteLength === 0) {
        handle.close();
        controller.close();
      } else {
        controller.enqueue(bytes);
      }
    },
    cancel() {
      handle.close();
    }
  });
}


export default class MobileFsDriver extends FsDriver {

  private getItem(uri: string): File | Directory {
    const directory = new Directory(uri);
    if (directory.exists) {
      return directory;
    }
    const file = new File(uri);
    if (file.exists) {
      return file;
    }
    throw new Error(`Item not found at URI: ${uri}`);
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
        console.error('[FilesService] Error getting file info:', error);
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

  protected override async _readDir(dirPath: string) {
    // Handling special case of '' for drive listing.
    if (dirPath === '') {
      return this.listDrives();
    }
    dirPath = pathToUri(dirPath);

    const contents = await FileSystem.readDirectoryAsync(dirPath);
    const promises = contents.map((fileName: string) => {
      const itemPath = Paths.join(dirPath, fileName);
      return this.toRemoteItem({ item: itemPath });
    });
    const results = await Promise.allSettled(promises);
    const items: RemoteItem[] = [];
    results.forEach((result: PromiseSettledResult<RemoteItem>) => {
      if (result.status === "fulfilled") {
        items.push(result.value);
      } else {
        console.error(`[FilesService] Error reading directory.`, result.reason);
      }
    });
    return items;
  }

  protected override async _mkDir(name: string, baseId: string) {
    baseId = pathToUri(baseId);
    const dirPath = Paths.join(baseId, this.normalizeFilename(name));
    const directory = new Directory(dirPath);
    directory.create({ intermediates: true, idempotent: true });
    return this.toRemoteItem({ item: directory });
  }

  protected override async _unlink(id: string) {
    id = pathToUri(id);
    await FileSystem.deleteAsync(id, { idempotent: true });
  }

  protected override async _rename(id: string, newName: string) {
    id = pathToUri(id);
    const parentDir = this.pathToParentFolder(id);
    const newPath = Paths.join(parentDir, this.normalizeFilename(newName));
    await FileSystem.moveAsync({ from: id, to: newPath });
    return this.toRemoteItem({ item: newPath });
  }

  protected override async _writeFile(folderId: string, fileContent: FileContent) {
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

  protected override async _readFile(id: string): Promise<FileContent> {
    // ph:// URLs point to iOS Photos library (DCIM) — direct filesystem
    // access is blocked by the iOS sandbox, so we use fetch() which
    // goes through the Photos framework.
    if (id.startsWith('ph://')) {
      const resolved = await resolveFileUri(id);
      return this.readWithFetch(resolved.fileUri, resolved.filename, resolved.mimeType || undefined);
    }

    id = pathToUri(id);
    // Try direct file read first (reliable), fall back to fetch for content URIs
    const file = new File(id);
    if (file.exists) {
      const stream = createFileReadStream(file);
      return {
        name: file.name,
        mime: file.type || getMimeType(file.name) || 'application/octet-stream',
        stream: stream
      };
    }
    if (modules.config.PLATFORM === MobilePlatform.ANDROID) {
      return this.readWithFetch(id);
    }
    throw new Error(`File not found at path: ${id}`);
  }

  private async readWithFetch(uri: string, overrideName?: string, overrideMime?: string): Promise<FileContent> {
    console.debug(`[FilesService] readWithFetch: starting fetch for ${uri.slice(0, 80)}`);
    const response = await fetch(uri);
    const contentLength = response.headers.get('Content-Length');
    console.debug(`[FilesService] readWithFetch: fetch completed, status=${response.status}, hasBody=${!!response.body}, contentLength=${contentLength}`);
    if (!response.ok) throw new Error("Failed to fetch file");
    if (!response.body) {
      console.debug('[FilesService] Fetch details have no body stream. URI:', uri, 'Status:', response.status);
      throw new Error("No data in file response");
    }

    // Use override name if provided, otherwise extract from response/URL
    let filename = overrideName;
    if (!filename) {
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }
      if (!filename) {
        const urlParts = uri.split('/');
        const raw = urlParts.filter(Boolean).pop() || 'file';
        try { filename = decodeURIComponent(raw); } catch { filename = raw; }
      }
    }

    // Use override mime if provided, otherwise extract from response/filename
    let mimeType = overrideMime;
    if (!mimeType) {
      mimeType = response.headers.get('Content-Type') || undefined;
      if (!mimeType) {
        mimeType = getMimeType(filename) || undefined;
      }
    }

    const stream = response.body;
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

  protected override async _updateFile(id: string, file: FileContent): Promise<RemoteItem> {
    id = pathToUri(id);
    file.name = this.pathToFilename(id);
    return this.writeFile(this.pathToParentFolder(id), file);
  }

  protected override async _moveFile(id: string, destParentId: string, newFileName: string, deleteSource: boolean): Promise<RemoteItem> {
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

  protected override async _moveDir(id: string, destParentId: string, newDirName: string, deleteSource: boolean): Promise<RemoteItem> {
    id = pathToUri(id);
    destParentId = pathToUri(destParentId);
    return this.moveFile(id, destParentId, newDirName, deleteSource);
  }

  protected override async _getStat(id: string): Promise<RemoteItem> {
    if (id.startsWith('ph://')) {
      const resolved = await resolveFileUri(id);
      return this.toRemoteItem({ item: resolved.fileUri, name: resolved.filename, mimeType: resolved.mimeType || undefined, loadStat: true });
    }
    id = pathToUri(id);
    return this.toRemoteItem({ item: id, loadStat: true });
  }

  protected override async _getFileHash(id: string): Promise<string> {
    id = pathToUri(id);
    const file = new File(id);
    if (!file.exists) throw new Error(`File not found: ${id}`);
    const hash = QuickCrypto.createHash('sha256');
    const stream = createFileReadStream(file);
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
    return hash.digest('hex').toString();
  }

  public override joinPaths(...paths: string[]): string {
    return Paths.join(...paths);
  }
}
