import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method, validateQuery, fetchStorage, fetchFsDriver, validateJson } from "../decorators";
import { FsDriver } from "../storageKit/interface";
import { Storage } from "../models";
import { scan, toggleService } from "../services/structure";
import photos from "./services/photos";
import thumb from "./services/thumb"

const api = new RouteGroup();

const scanSchema = {
    type: 'object',
    properties: {
        storageId: { type: 'string' },
        force: { type: 'string' },
    },
    required: ['storageId'],
};

api.add('/scan', [
    method(['POST', 'GET']),
    validateQuery(scanSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const force = request.getParams.force === 'true' || false;
    try {
        const storageMeta = await scan(fsDriver, force);
        return ApiResponse.json(200, storageMeta.getDetails());
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not scan storage structure', {
            error: e.message
        });
    }
});

const toggleServiceSchema = {
    type: 'object',
    properties: {
        storageId: { type: 'number' },
        appName: { type: 'string' },
        enable: { type: 'boolean' },
    },
    required: ['storageId', 'appName', 'enable'],
};

api.add('/toggleService', [
    method(['POST']),
    validateJson(toggleServiceSchema),
    fetchStorage(),
], async (request: ApiRequest) => {
    const storage = request.local.storage as Storage;
    const { appName, enable } = request.local.json;
    const storageMeta = await storage.getStorageMeta();
    if (!storageMeta) {
        return ApiResponse.error(400, 'Storage meta not found');
    }
    try {
        await toggleService(storageMeta, appName, enable);
        return ApiResponse.json(200, storageMeta.getDetails());
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not toggle service', {
            error: e.message
        });
    }
});

api.add('/photos', photos.handle);
api.add('/thumb', thumb.handle);

export default api;
