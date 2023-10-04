import { ApiRequest, ApiResponse, RouteGroup } from "../../interface";
import { method, fetchStorage, fetchFsDriver, validateJson } from "../../decorators";
import ThumbService from "../../services/thumb/thumbService";
import { FsDriver } from "../../storageKit/interface";

const api = new RouteGroup();

const getThumbnailSchema = {
    type: 'object',
    properties: {
        fileId: { type: 'string' },
        storageId: { type: 'number' },
        lastUpdated: { type: 'number' },
    },
    required: ['fileId', 'storageId'],
};

api.add('/getThumbnail', [
    method(['POST']),
    validateJson(getThumbnailSchema),
    fetchStorage(),
    fetchFsDriver(),
], async (request: ApiRequest) => {
    const { fileId, lastUpdated } = request.local.json;
    const fsDriver = request.local.fsDriver as FsDriver;
    if(fsDriver.providesThumbnail) {
        const stat = await fsDriver.getStat(fileId);
        return ApiResponse.json(200, {
            fileId: stat.id,
            mimeType: stat.mimeType,
            updatedAt: stat.lastModified,
            image: stat.thumbnail,
            height: null,
            width: null,
        });
    }
    const thumbService = new ThumbService(fsDriver);
    try {
        let date = new Date(0);
        if (lastUpdated) {
            date = new Date(lastUpdated);
        }
        const thumb = await thumbService.getOrCreateThumb(fileId, date);
        return ApiResponse.json(200, thumb.getDetails());
    } catch (e: any) {
        console.error(e);
        e.message = `Could not get thumbnail: ${e.message}`;
        return ApiResponse.fromError(e);
    }
});

export default api;
