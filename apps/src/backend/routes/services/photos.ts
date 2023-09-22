import { ApiRequest, ApiRequestFile, ApiResponse, RouteGroup } from "../../interface";
import { method, validateQuery, fetchStorage, fetchFsDriver, fetchPhotoService, validateJson } from "../../decorators";
import PhotosService, { UploadManager } from "../../services/photos/photosService";

const api = new RouteGroup();

const commonOptions = {
    storageId: { type: 'number' },
};

function buildMiddlewares(method_: string, schema?: any) {
    const middlewares = [
        method([method_]),
    ]
    if (schema) {
        middlewares.push(method_ === 'GET' ? validateQuery(schema) : validateJson(schema));
    }
    middlewares.push(
        fetchStorage(),
        fetchFsDriver(),
        fetchPhotoService(),
    );
    return middlewares;
}

const syncSchema = {
    type: 'object',
    properties: {
        hard: { type: 'string' },
        storageId: { type: 'string' },
    },
    required: ['storageId'],
};

api.add('/sync', buildMiddlewares('GET', syncSchema), async (request: ApiRequest) => {
    const photoService = request.local.photoService as PhotosService;
    const hard = request.getParams.hard === 'true' || false;
    try {
        const res = await photoService.sync(hard);
        return ApiResponse.json(200, res);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not sync photos', {
            error: e.message
        });
    }
});

api.add('/upload', buildMiddlewares('POST'), async (request: ApiRequest) => {
    const photoService = request.local.photoService as PhotosService;
    const uploadManager = new UploadManager(photoService);

    if (request.mayContainFiles && request.fetchMultipartForm) {
        try {
            await uploadManager.start();
        }
        catch (e: any) {
            console.error(e);
            return ApiResponse.error(400, 'Could not upload photos', {
                error: e.message
            });
        }
        await request.fetchMultipartForm(async (type, data) => {
            if (type === 'file') {
                await uploadManager.addPhoto(data as ApiRequestFile);
            }
        });
        const updates = await uploadManager.end();
        return ApiResponse.json(201, updates);
    } else {
        console.log(request.mayContainFiles, request.fetchMultipartForm)
        return ApiResponse.error(400, 'No files found');
    }
});

api.add('/updateAsset', buildMiddlewares('POST'), async (request: ApiRequest) => {
    const photoService = request.local.photoService as PhotosService;
    let itemId: number | null = null;
    let updates: any = null;

    if (request.mayContainFiles && request.fetchMultipartForm) {
        await request.fetchMultipartForm(async (type, data) => {
            if (type === 'field') {
                if (data.name === 'itemId') {
                    itemId = parseInt(data.value);
                }
            }
            else if (type === 'file') {
                if (itemId === null) {
                    console.error('itemId not found');
                    data.stream.resume();
                }
                updates = await photoService.updateAsset(itemId!, data as ApiRequestFile);
            }
        });
        return ApiResponse.json(201, updates);
    } else {
        console.log(request.mayContainFiles, request.fetchMultipartForm)
        return ApiResponse.error(400, 'No files found');
    }
});

const deleteSchema = {
    type: 'object',
    properties: {
        itemIds: { type: 'array', items: { type: 'number' } },
        ...commonOptions,
    },
    required: ['itemIds', 'storageId'],
};

api.add('/delete', buildMiddlewares('POST', deleteSchema), async (request: ApiRequest) => {
    const photoService = request.local.photoService as PhotosService;
    const itemIds = request.local.json.itemIds as number[];
    try {
        const res = await photoService.deletePhotos(itemIds);
        return ApiResponse.json(200, res);
    } catch (e: any) {
        console.error(e);
        return ApiResponse.error(400, 'Could not delete photos', {
            error: e.message
        });
    }
});

export default api;
