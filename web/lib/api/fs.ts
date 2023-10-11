import { ApiClient } from './apiClient';
import { RemoteItem } from '../types';

export type ReadDirParams = {
    storageId: number;
    id: string;
};

export async function readDir(params: ReadDirParams) {
    return await ApiClient.post<RemoteItem[]>('/fs/readDir', params);
}

export type ReadFileParams = {
    storageId: number;
    id: string;
};

export async function readFile(params: ReadFileParams) {
    return await ApiClient.post<string>('/fs/readFile', params);
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
    return await ApiClient.post<{deleted: boolean}>('/fs/unlink', params);
}

export type unlinkMultipleParams = {
    storageId: number;
    ids: string[];
};

export async function unlinkMultiple(params: unlinkMultipleParams) {
    return await ApiClient.post<{deletedIds: string[]}>('/fs/unlinkMultiple', params);
}

export type GetStatParams = {
    storageId: number;
    id: string;
};

export async function getStat(params: GetStatParams) {
    return await ApiClient.post<RemoteItem>('/fs/getStat', params);
}
