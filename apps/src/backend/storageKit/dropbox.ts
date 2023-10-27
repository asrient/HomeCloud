import { Dropbox } from 'dropbox';
import { files as dbxFiles } from 'dropbox';
const ds = require('dropbox-stream');
import { StorageType } from "../envConfig";
import { FsDriver, RemoteItem } from "./interface";
import { getAccessToken } from "./oneAuth";
import { ApiRequestFile } from "../interface";
import { ReadStream } from "fs";
import path from "path";
import mime from 'mime';

export class DropboxFsDriver extends FsDriver {
  override storageType = StorageType.Dropbox;
  override providesThumbnail = true;
  driver?: Dropbox;
  accessToken?: string;

  override async init() {
    const accessToken = await getAccessToken(this.storage);
    if (!accessToken) {
      throw new Error("Could not get access token");
    }
    this.accessToken = accessToken;
    this.driver = new Dropbox({
      accessToken,
    });
  }

  // reference: 
  toRemoteItem(item: dbxFiles.FileMetadata
    | dbxFiles.FolderMetadata
    | dbxFiles.DeletedMetadata
    | dbxFiles.FileMetadataReference
    | dbxFiles.FolderMetadataReference
    | dbxFiles.DeletedMetadataReference): RemoteItem {
    let isDir = false;
    if (".tag" in item) {
      isDir = item[".tag"] === "folder";
    } else {
      isDir = !('size' in item);
    }

    const size = 'size' in item ? item.size : null;
    const name = item.name;
    const id = item.path_lower || `/_unmounted_/${name}`;
    const mimeType = isDir ? null : mime.getType(name);
    const lastModified = 'server_modified' in item ? new Date(item.server_modified) : null;
    const parentIds = id !== '/' ? [this.pathToParentFolder(id)] : null;

    return {
      id,
      type: isDir ? 'directory' : 'file',
      name,
      mimeType,
      lastModified,
      size,
      parentIds,
      createdAt: null,
      etag: null,
      thumbnail: null,
    };
  }

  rootToRemoteItem(): RemoteItem {
    return {
      id: '/',
      type: 'directory',
      name: 'Dropbox',
      mimeType: null,
      lastModified: null,
      size: null,
      parentIds: null,
      createdAt: null,
      etag: null,
      thumbnail: null,
    };
  }

  normalizeRootId(id: string): string {
    if (id === "/") {
      return "";
    }
    return id;
  }

  public override async readDir(id: string) {
    id = this.normalizeRootId(id);
    try {
      const res = await this.driver!.filesListFolder({
        path: id,
        limit: 2000,
      });
      if (!res.result.entries) {
        console.error("Error getting files", res);
        throw new Error("Could not get files");
      }
      const files = res.result.entries;
      return files.map((item) => this.toRemoteItem(item));
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  public override async mkDir(
    name: string,
    parentId: string,
  ): Promise<RemoteItem> {
    parentId = this.normalizeRootId(parentId);
    try {
      const res = await this.driver!.filesCreateFolderV2({
        path: `${parentId}/${name}`,
      });
      if (!res.result) {
        console.error("Error creating folder", res);
        throw new Error("Could not create folder");
      }
      return this.toRemoteItem(res.result.metadata);
    } catch (err) {
      // Handle error
      console.error(err);
      throw err;
    }
  }

  public override async unlink(id: string): Promise<void> {
    try {
      const res = await this.driver!.filesDeleteV2({
        path: id,
      });
      if (!res.result) {
        console.error("Error deleting file", res);
        throw new Error("Could not delete file");
      }
    } catch (err) {
      // Handle error
      console.error(err);
      throw err;
    }
  }

  pathToFilename(filePath: string) {
    return path.posix.basename(filePath);
  }

  pathToParentFolder(filePath: string) {
    return path.posix.dirname(filePath);
  }

  public override async rename(
    id: string,
    newName: string,
  ): Promise<RemoteItem> {
    const parentDir = this.pathToParentFolder(id);
    return this.moveFile(id, parentDir, newName, true);
  }

  public override async writeFile(
    folderId: string,
    file: ApiRequestFile,
    mode = 'add',
  ): Promise<RemoteItem> {
    return new Promise<RemoteItem>((resolve, reject) => {
      folderId = this.normalizeRootId(folderId);
      const filePath = `${folderId}/${file.name}`;
      const up = ds.createDropboxUploadStream({
        token: this.accessToken!,
        path: filePath,
        chunkSize: 1000 * 1024,
        autorename: false,
        mode,
      });
      up.on('error', (e: any) => {
        console.log('Error:', e);
        reject(e);
      })
        .on('metadata', (metadata: dbxFiles.FileMetadata) => {
          resolve(this.toRemoteItem(metadata));
        });

      file.stream
        .pipe(up)
        .on('error', (e: any) => {
          console.log('Error:', e);
          reject(e);
        })
        .on('finish', () => {
          console.log('File uploaded!');
        })
    });
  }

  public override async updateFile(
    id: string,
    file: ApiRequestFile,
  ): Promise<RemoteItem> {
    const parentDir = this.pathToParentFolder(id);
    const filename = this.pathToFilename(id);
    file.name = filename;
    return this.writeFile(parentDir, file, 'overwrite');
  }

  public override async readFile(id: string): Promise<[ReadStream, string]> {
    id = this.normalizeRootId(id);
    const down = ds.createDropboxDownloadStream({
      token: this.accessToken!,
      path: id,
    });
    return new Promise<[ReadStream, string]>((resolve, reject) => {
      down.on('error', reject)
        .on('metadata', (metadata: dbxFiles.FileMetadata) => {
          const item = this.toRemoteItem(metadata);
          resolve([down, item.mimeType || "application/octet-stream"]);
        })
    });
  }

  public override async moveFile(
    id: string,
    destParentId: string,
    newFileName: string,
    deleteSource: boolean,
  ): Promise<RemoteItem> {
    destParentId = this.normalizeRootId(destParentId);
    const destPath = `${destParentId}/${newFileName}`;
    if (deleteSource) {
      try {
        const res = await this.driver!.filesMoveV2({
          from_path: id,
          to_path: destPath,
        });
        if (!res.result) {
          console.error("Error moving file", res);
          throw new Error("Could not move file");
        }
        return this.toRemoteItem(res.result.metadata);
      } catch (err) {
        // Handle error
        console.error(err);
        throw err;
      }
    } else {
      try {
        const res = await this.driver!.filesCopyV2({
          from_path: id,
          to_path: destPath,
        });
        if (!res.result) {
          console.error("Error copying file", res);
          throw new Error("Could not copy file");
        }
        return this.toRemoteItem(res.result.metadata);
      } catch (err) {
        // Handle error
        console.error(err);
        throw err;
      }
    }
  }

  public override async moveDir(
    id: string,
    destParentId: string,
    newDirName: string,
    deleteSource: boolean,
  ): Promise<RemoteItem> {
    return this.moveFile(id, destParentId, newDirName, deleteSource);
  }

  public override async getStat(id: string): Promise<RemoteItem> {
    id = this.normalizeRootId(id);
    if (id === '') {
      return this.rootToRemoteItem();
    }
    try {
      const res = await this.driver!.filesGetMetadata({
        path: id,
      });
      if (!res.result) {
        console.error("Error getting file metadata", res);
        throw new Error("Could not get file metadata");
      }
      return this.toRemoteItem(res.result);
    } catch (err) {
      // Handle error
      console.error(err);
      throw err;
    }
  }

  public override async readRootDir() {
    return this.readDir("/");
  }

  public override async getStatByFilename(
    filename: string,
    parentId: string,
  ): Promise<RemoteItem> {
    parentId = this.normalizeRootId(parentId);
    const filePath = `${parentId}/${filename}`;
    return this.getStat(filePath);
  }

  public override async getIdByFilename(
    filename: string,
    baseId: string,
  ): Promise<string> {
    return (await this.getStatByFilename(filename, baseId)).id;
  }

  public override async getThumbnailUrl(id: string): Promise<string> {
    id = this.normalizeRootId(id);
    try {
      const res = await this.driver!.filesGetThumbnailV2({
        resource: {
          path: id,
          '.tag': 'path',
        },
        size: {
          '.tag': 'w256h256',
        }
      });
      if (!res.result) {
        console.error("Error getting thumbnail", res);
        throw new Error("Could not get thumbnail");
      }
      if(!('fileBinary' in res.result)) {
        throw new Error("No thumbnail found");
      }
      const binary = res.result.fileBinary as Buffer;
      const base64 = binary.toString('base64');
      return `data:image/jpeg;base64,${base64}`;
    } catch (err) {
      // Handle error
      console.error(err);
      throw err;
    }
  }
}
