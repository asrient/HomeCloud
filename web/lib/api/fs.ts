import { ApiClient } from './apiClient';
import { FileList_, RemoteItem } from '../types';

export type ReadDirParams = {
    storageId: number;
    id: string;
};

export async function readDir(params: ReadDirParams) {
    return await ApiClient.post<RemoteItem[]>('/fs/readDir', params);
}

export async function readFile(storageId: number, fileId: string) {
    return await ApiClient.get<Blob>('/fs/readFile', {
        storageId: storageId.toString(),
        id: fileId,
    });
}

export type MkDirParams = {
    storageId: number;
    parentId: string;
    name: string;
};

export async function mkDir(params: MkDirParams) {
    return await ApiClient.post<RemoteItem>('/fs/mkDir', params);
}

export type RenameParams = {
    storageId: number;
    id: string;
    newName: string;
};

export async function rename(params: RenameParams) {
    return await ApiClient.post<RemoteItem>('/fs/rename', params);
}

export type MoveFileParams = {
    storageId: number;
    fileId: string;
    destParentId: string;
    newFileName: string;
    deleteSource: boolean;
};

export async function moveFile(params: MoveFileParams) {
    return await ApiClient.post<RemoteItem>('/fs/moveFile', params);
}

export type UnlinkParams = {
    storageId: number;
    id: string;
};

export async function unlink(params: UnlinkParams) {
    return await ApiClient.post<{ deleted: boolean }>('/fs/unlink', params);
}

export type unlinkMultipleParams = {
    storageId: number;
    ids: string[];
};

export async function unlinkMultiple(params: unlinkMultipleParams) {
    return await ApiClient.post<{ deletedIds: string[] }>('/fs/unlinkMultiple', params);
}

export type GetStatParams = {
    storageId: number;
    id: string;
};

export async function getStat(params: GetStatParams) {
    return await ApiClient.post<RemoteItem>('/fs/getStat', params);
}

export type GetStatByFilename = {
    storageId: number;
    parentId: string;
    name: string;
};

export async function getStatByFilename(params: GetStatByFilename) {
    return await ApiClient.post<RemoteItem>('/fs/getStatByFilename', params);
}

export type UploadParams = {
    storageId: number;
    parentId: string;
    files: FileList_;
};

export async function upload(params: UploadParams) {
    /*
    if (isDesktop()) {
        const body = {
            storageId: params.storageId,
            parentId: params.parentId,
            filePaths: Array.from(params.files).map((f) => (f as File_).path)
        }
        return await ApiClient.post<RemoteItem[]>('/fs/writeFiles/desktop', body);
    }
    */
    const formData = new FormData();
    formData.append('parentId', params.parentId);
    for (let i = 0; i < params.files.length; i++) {
        formData.append('files', params.files[i], params.files[i].name);
    }
    return await ApiClient.post<RemoteItem[]>('/fs/writeFiles', { storageId: params.storageId }, formData);
}

export type writeTextFileParams = {
    storageId: number;
    parentId: string;
    fileName: string;
    content: string;
    mimeType: string;
};

export async function writeTextFile(params: writeTextFileParams) {
    return await ApiClient.post<RemoteItem>('/fs/writeTextFile', params);
}

export type updateTextFileParams = {
    storageId: number;
    fileId: string;
    content: string;
    mimeType: string;
};

export async function updateTextFile(params: updateTextFileParams) {
    return await ApiClient.post<RemoteItem>('/fs/updateTextFile', params);
}
