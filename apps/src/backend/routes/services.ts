import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method, validateQuery, fetchStorage, fetchFsDriver } from "../decorators";
import { FsDriver } from "../storageKit/interface";
import { scan } from "../services/structure";
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
        const res = await scan(fsDriver, force);
        return ApiResponse.json(200, res);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not scan storage structure', {
            error: e.message
        });
    }
});

api.add('/photos', photos.handle);
api.add('/thumb', thumb.handle);

export default api;
