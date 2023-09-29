import { ApiRequest, ApiResponse, RouteGroup, ApiRequestFile } from "../interface";
import { method, validateJson, authenticate, fetchStorage, fetchFsDriver } from "../decorators";
import { envConfig } from "../envConfig";
import { FsDriver, RemoteItem } from "../storageKit/interface";
import mime from 'mime';
import fs from 'fs';

const api = new RouteGroup();

const commonOptions = {
    storageId: { type: 'number' },
}

const readDirSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        ...commonOptions,
    },
    required: ['id'],
};

api.add('/readDir', [
    method(['POST']),
    authenticate(),
    validateJson(readDirSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const pathId = request.local.json.id;
    try {
        const contents = await fsDriver.readDir(pathId);
        return ApiResponse.json(200, contents);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not get contents of dir', {
            error: e.message
        });
    }
});

const mkDirSchema = {
    type: 'object',
    properties: {
        parentId: { type: 'string' },
        name: { type: 'string' },
        ...commonOptions,
    },
    required: ['parentId', 'name'],
};

api.add('/mkDir', [
    method(['POST']),
    authenticate(),
    validateJson(mkDirSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const parentId = request.local.json.parentId;
    const name = request.local.json.name;
    try {
        const item = await fsDriver.mkDir(name, parentId);
        return ApiResponse.json(201, item);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not create dir', {
            error: e.message
        });
    }
});

const unlinkSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        ...commonOptions,
    },
    required: ['id'],
};

api.add('/unlink', [
    method(['POST']),
    authenticate(),
    validateJson(unlinkSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const id = request.local.json.id;
    try {
        await fsDriver.unlink(id);
        return ApiResponse.json(200, {
            deleted: true,
        });
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not delete item', {
            error: e.message
        });
    }
});

const unlinkMultipleSchema = {
    type: 'object',
    properties: {
        ids: {
            type: 'array',
            items: { type: 'string' },
        },
        ...commonOptions,
    },
    required: ['ids'],
};

api.add('/unlinkMultiple', [
    method(['POST']),
    authenticate(),
    validateJson(unlinkMultipleSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const ids = request.local.json.ids;
    try {
        await fsDriver.unlinkMultiple(ids);
        return ApiResponse.json(200, {
            deleted: true,
        });
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not delete items', {
            error: e.message
        });
    }
});

const renameSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        newName: { type: 'string' },
        ...commonOptions,
    },
    required: ['id', 'newName'],
};

api.add('/rename', [
    method(['POST']),
    authenticate(),
    validateJson(renameSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const id = request.local.json.id;
    const newName = request.local.json.newName;
    try {
        const item = await fsDriver.rename(id, newName);
        return ApiResponse.json(200, item);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not rename item', {
            error: e.message
        });
    }
});

const readFileSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        ...commonOptions,
    },
    required: ['id'],
};

api.add('/readFile', [
    method(['POST']),
    authenticate(),
    validateJson(readFileSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const id = request.local.json.id;
    try {
        const [stream, mime] = await fsDriver.readFile(id);
        return ApiResponse.stream(200, stream, mime || 'application/octet-stream');
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not read stream', {
            error: e.message
        });
    }
});

api.add('/writeFiles', [
    method(['POST']),
    authenticate(),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;

    let parentId: string | null = null;
    const items: RemoteItem[] = [];

    const processFile = async (file: ApiRequestFile) => {
        const stream = file.stream;
        if (!parentId) {
            console.error('got file before parentId');
            stream.resume();
            return;
        }
        try {
            const item = await fsDriver.writeFile(parentId, file);
            items.push(item);
        }
        catch (e: any) {
            console.error(e);
            return;
        }
    }

    if (request.mayContainFiles && request.fetchMultipartForm) {
        await request.fetchMultipartForm(async (type, data) => {
            if (type === 'field') {
                if (data.name === 'parentId') {
                    parentId = data.value;
                }
            } else if (type === 'file') {
                await processFile(data as ApiRequestFile);
            }
        });
        return ApiResponse.json(201, items);
    } else {
        return ApiResponse.error(400, 'No files found');
    }
});

const writeFilesSchema = {
    type: 'object',
    properties: {
        parentId: { type: 'string' },
        files: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    path: { type: 'string' },
                },
                required: ['path'],
            }
        },
        ...commonOptions,
    },
    required: ['parentId', 'files'],
};

api.add('/writeFiles/desktop', [
    method(['POST']),
    authenticate(),
    validateJson(writeFilesSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;

    if (!envConfig.isDesktop()) {
        return ApiResponse.error(400, 'Not allowed');
    }

    const parentId = request.local.json.parentId;
    const files = request.local.json.files;

    const fileItems: ApiRequestFile[] = files.map((file: any) => {
        const stream = fs.createReadStream(file.path);
        return {
            name: file.path.split('/').pop()!,
            mime: mime.getType(file.path) || 'application/octet-stream',
            stream,
        } as ApiRequestFile;
    });

    try {
        const items = await fsDriver.writeFiles(parentId, fileItems);
        return ApiResponse.json(201, items);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not write files', {
            error: e.message
        });
    }
});

api.add('/updateFile', [
    method(['POST']),
    authenticate(),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;

    let id: string | null = null;
    let item: RemoteItem | null = null;
    let fileReceived = false;

    const processFile = async (file: ApiRequestFile) => {
        const stream = file.stream;
        if (!id || fileReceived) {
            console.error('got file before id or multiple files');
            stream.resume();
            return;
        }
        fileReceived = true;
        item = await fsDriver.updateFile(id, file);
    }

    if (request.mayContainFiles && request.fetchMultipartForm) {
        await request.fetchMultipartForm(async (type, data) => {
            if (type === 'field') {
                if (data.name === 'id') {
                    id = data.value;
                }
            } else if (type === 'file') {
                await processFile(data as ApiRequestFile);
            }
        });
        return ApiResponse.json(201, item);
    } else {
        return ApiResponse.error(400, 'No files found');
    }
});

const moveSchema = {
    type: 'object',
    properties: {
        fileId: { type: 'string' },
        destParentId: { type: 'string' },
        newFileName: { type: 'string' },
        deleteSource: { type: 'boolean', default: false },
        ...commonOptions,
    },
    required: ['fileId', 'destParentId', 'newFileName'],
};

api.add('/moveFile', [
    method(['POST']),
    authenticate(),
    validateJson(moveSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const { fileId, destParentId, newFileName, deleteSource } = request.local.json;
    try {
        const item = await fsDriver.moveFile(fileId, destParentId, newFileName, deleteSource);
        return ApiResponse.json(200, item);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not move item', {
            error: e.message
        });
    }
});

const moveDirSchema = {
    type: 'object',
    properties: {
        dirId: { type: 'string' },
        destParentId: { type: 'string' },
        newDirName: { type: 'string' },
        deleteSource: { type: 'boolean', default: false },
        ...commonOptions,
    },
    required: ['dirId', 'destParentId', 'newDirName'],
};

api.add('/moveDir', [
    method(['POST']),
    authenticate(),
    validateJson(moveDirSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const { dirId, destParentId, newDirName, deleteSource } = request.local.json;
    try {
        const item = await fsDriver.moveDir(dirId, destParentId, newDirName, deleteSource);
        return ApiResponse.json(200, item);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not move item', {
            error: e.message
        });
    }
});

const getStatSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        ...commonOptions,
    },
    required: ['id'],
};

api.add('/getStat', [
    method(['POST']),
    authenticate(),
    validateJson(getStatSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const id = request.local.json.id;
    try {
        const item = await fsDriver.getStat(id);
        return ApiResponse.json(200, item);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not get item stat', {
            error: e.message
        });
    }
});

const getStatsSchema = {
    type: 'object',
    properties: {
        ids: {
            type: 'array',
            items: { type: 'string' },
        },
        ...commonOptions,
    },
    required: ['ids'],
};

api.add('/getStats', [
    method(['POST']),
    authenticate(),
    validateJson(getStatsSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const ids = request.local.json.ids;
    try {
        const items = await fsDriver.getStats(ids);
        return ApiResponse.json(200, items);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not get item stats', {
            error: e.message
        });
    }
});

const getStatByFilenameSchema = {
    type: 'object',
    properties: {
        parentId: { type: 'string' },
        name: { type: 'string' },
        ...commonOptions,
    },
    required: ['name'],
};

api.add('/getStatByFilename', [
    method(['POST']),
    authenticate(),
    validateJson(getStatByFilenameSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    let { parentId, name } = request.local.json;
    if (!parentId || parentId === '/' || parentId === '') {
        parentId = null;
    }
    try {
        const stats = await fsDriver.getStatByFilename(name, parentId);
        return ApiResponse.json(200, stats);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not get item id', {
            error: e.message
        });
    }
});

export default api;
