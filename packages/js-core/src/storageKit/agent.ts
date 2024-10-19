import { FsDriver, RemoteItem } from "./interface";
import { ApiRequestFile } from "../interface";
import { StorageType } from "../envConfig";
import { AgentClient, getClientFromStorage } from "../agentKit/client";
import FormData from "form-data";
import { Readable } from "stream";

export class AgentFsDriver extends FsDriver {
  override storageType = StorageType.Agent;
  override providesThumbnail = false;
  client: AgentClient;

  override async init() {
    this.client = await getClientFromStorage(this.storage);
  }

  apiPath(command: string) {
    return `api/fs/${command}`;
  }

  public override async readDir(dirPath: string) {
    return await this.client.post<RemoteItem[]>(this.apiPath('readDir'), { id: dirPath });
  }
  
  public override async mkDir(name: string, parentId: string) {
    return await this.client.post<RemoteItem>(this.apiPath('mkDir'), { parentId, name });
  }

  public override async unlink(id: string) {
    await this.client.post<{ deleted: boolean }>(this.apiPath('unlink'), { id });
  }

  public override async unlinkMultiple(ids: string[]) {
    const { deletedIds } = await this.client.post<{ deletedIds: string[] }>(this.apiPath('unlinkMultiple'), { ids });
    return deletedIds;
  }

  public override async rename(id: string, newName: string) {
    return await this.client.post<RemoteItem>(this.apiPath('rename'), { id, newName });
  }

  public override async writeFile(
    folderId: string,
    file: ApiRequestFile,
    overwrite = false,
  ) {
    const result = await this.writeFiles(folderId, [file]);
    return result[0];
  }

  public override async writeFiles(
    folderId: string,
    files: ApiRequestFile[],
  ) {
    const formData = new FormData();
    formData.append('parentId', folderId);
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i].stream, {
        filename: files[i].name,
        contentType: files[i].mime,
      });
    }
    return await this.client.post<RemoteItem[]>(this.apiPath('writeFiles'), formData);
  }

  public override async readFile(id: string): Promise<[Readable, string]> {
    const { stream, mime } = await this.client.getToStream(this.apiPath('readFile'), { id });
    return [stream, mime];
  }

  public override async updateFile(
    id: string,
    file: ApiRequestFile,
  ): Promise<RemoteItem> {
    const formData = new FormData();
    formData.append('id', id);
    formData.append('file', file.stream, {
      filename: file.name,
      contentType: file.mime,
    });
    return await this.client.post<RemoteItem>(this.apiPath('updateFile'), formData);
  }

  public override async moveFile(
    id: string,
    destParentId: string,
    newFileName: string,
    deleteSource: boolean,
  ): Promise<RemoteItem> {
    return await this.client.post<RemoteItem>(this.apiPath('moveFile'), {
      fileId: id,
      destParentId,
      newFileName,
      deleteSource,
    });
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
    return await this.client.post<RemoteItem>(this.apiPath('getStat'), { id });
  }
}
