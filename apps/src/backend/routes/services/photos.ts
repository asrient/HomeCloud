import {
  ApiRequest,
  ApiRequestFile,
  ApiResponse,
  RouteGroup,
} from "../../interface";
import {
  method,
  validateQuery,
  fetchStorage,
  fetchFsDriver,
  fetchPhotoService,
  validateJson,
} from "../../decorators";
import PhotosService, {
  UploadManager,
} from "../../services/photos/photosService";
import CustomError from "../../customError";
import { Photo, getPhotosParams } from "../../models";
import mime from "mime";

const api = new RouteGroup();

const commonOptions = {
  storageId: { type: "number" },
};

function buildMiddlewares(method_: string, schema?: any) {
  const middlewares = [method([method_])];
  if (schema) {
    middlewares.push(
      method_ === "GET" ? validateQuery(schema) : validateJson(schema),
    );
  }
  middlewares.push(fetchStorage(), fetchFsDriver(), fetchPhotoService());
  return middlewares;
}

const syncSchema = {
  type: "object",
  properties: {
    hard: { type: "string" },
    storageId: { type: "string" },
    force: { type: "string" },
  },
  required: ["storageId"],
};

api.add(
  "/sync",
  buildMiddlewares("GET", syncSchema),
  async (request: ApiRequest) => {
    const photoService = request.local.photoService as PhotosService;
    const hard = request.getParams.hard === "true" || false;
    const force = request.getParams.force === "true" || false;
    try {
      await photoService.sync(hard, force);
      return ApiResponse.json(200, {
        ok: true,
      });
    } catch (e: any) {
      console.error(e);
      e.message = `Could not sync photos: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

api.add("/upload/", buildMiddlewares("POST"), async (request: ApiRequest) => {
  const photoService = request.local.photoService as PhotosService;
  const uploadManager = new UploadManager(photoService);

  if (request.mayContainFiles && request.fetchMultipartForm) {
    try {
      await uploadManager.start();
    } catch (e: any) {
      console.error(e);
      e.message = `Could not start upload: ${e.message}`;
      return ApiResponse.fromError(e);
    }
    await request.fetchMultipartForm(async (type, data) => {
      if (type === "file") {
        await uploadManager.addPhoto(data as ApiRequestFile);
      }
    });
    try {
      const updates = await uploadManager.end();
      return ApiResponse.json(201, updates);
    } catch (e: any) {
      console.error(e);
      e.message = `Could update change log: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  } else {
    console.log(request.mayContainFiles, request.fetchMultipartForm);
    return ApiResponse.fromError(
      CustomError.validationSingle("files ", "No files found"),
    );
  }
});

const uploadDesktopSchema = {
  type: "object",
  properties: {
    filePaths: { type: "array", items: { type: "string" } },
    ...commonOptions,
  },
  required: ["storageId"],
};

api.add(
  "/upload/desktop",
  buildMiddlewares("POST", uploadDesktopSchema),
  async (request: ApiRequest) => {
    const photoService = request.local.photoService as PhotosService;
    const uploadManager = new UploadManager(photoService);
    try {
      await uploadManager.start();
    } catch (e: any) {
      console.error(e);
      e.message = `Could not start upload: ${e.message}`;
      return ApiResponse.fromError(e);
    }
    const filePaths = request.local.json.filePaths as string[];
    if (!filePaths.length) {
      return ApiResponse.fromError(
        CustomError.validationSingle("files ", "No files found"),
      );
    }
    const promises = filePaths.map(async (filePath) => {
      const mimeType = mime.getType(filePath);
      if (!mimeType) return;
      await uploadManager.addPhotoFromFile(filePath, mimeType);
    });
    await Promise.all(promises);
    try {
      const updates = await uploadManager.end();
      return ApiResponse.json(201, updates);
    } catch (e: any) {
      console.error(e);
      e.message = `Could update change log: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

api.add(
  "/updateAsset",
  buildMiddlewares("POST"),
  async (request: ApiRequest) => {
    const photoService = request.local.photoService as PhotosService;
    let itemId: number | null = null;
    let updates: any = null;

    if (request.mayContainFiles && request.fetchMultipartForm) {
      try {
        await request.fetchMultipartForm(async (type, data) => {
          if (type === "field") {
            if (data.name === "itemId") {
              itemId = parseInt(data.value);
            }
          } else if (type === "file") {
            if (itemId === null) {
              console.error("itemId not found");
              data.stream.resume();
              return;
            }
            updates = await photoService.updateAsset(
              itemId!,
              data as ApiRequestFile,
            );
          }
        });
        return ApiResponse.json(201, updates);
      } catch (e: any) {
        console.error(e);
        e.message = `Could not update asset: ${e.message}`;
        return ApiResponse.fromError(e);
      }
    } else {
      //console.log(request.mayContainFiles, request.fetchMultipartForm)
      return ApiResponse.fromError(
        CustomError.validationSingle("files ", "No files found"),
      );
    }
  },
);

const deleteSchema = {
  type: "object",
  properties: {
    itemIds: { type: "array", items: { type: "number" } },
    ...commonOptions,
  },
  required: ["itemIds", "storageId"],
};

api.add(
  "/delete",
  buildMiddlewares("POST", deleteSchema),
  async (request: ApiRequest) => {
    const photoService = request.local.photoService as PhotosService;
    const itemIds = request.local.json.itemIds as number[];
    try {
      const res = await photoService.deletePhotos(itemIds);
      return ApiResponse.json(200, res);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not delete photos: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const importSchema = {
  type: "object",
  properties: {
    fileIds: { type: "array", items: { type: "string" } },
    deleteSource: { type: "boolean" },
    ...commonOptions,
  },
  required: ["fileIds", "storageId"],
};

api.add(
  "/import",
  buildMiddlewares("POST", importSchema),
  async (request: ApiRequest) => {
    const photoService = request.local.photoService as PhotosService;
    const fileIds = request.local.json.fileIds as string[];
    const deleteSource = request.local.json.deleteSource as boolean;
    try {
      const res = await photoService.importPhotos(fileIds, !!deleteSource);
      return ApiResponse.json(200, res);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not import photos: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const archiveSchema = {
  type: "object",
  properties: {
    ...commonOptions,
  },
  required: ["storageId"],
};

api.add("/archive", buildMiddlewares("POST", archiveSchema), async (request: ApiRequest) => {
  const photoService = request.local.photoService as PhotosService;
  try {
    await photoService.archive();
    return ApiResponse.json(200, {
      ok: true,
    });
  } catch (e: any) {
    console.error(e);
    e.message = `Could not archive photos: ${e.message}`;
    return ApiResponse.fromError(e);
  }
});

const listPhotosSchema = {
  type: "object",
  properties: {
    storageIds: { type: "array", items: { type: "number" } },
    limit: { type: "number" },
    offset: { type: "number" },
    sortBy: { type: "string", enum: ["capturedOn", "itemId", "mimeType", "lastEditedOn", "addedOn", "size", "duration"] },
    ascending: { type: "boolean" },
  },
  required: ["storageIds", "limit", "offset", "sortBy"],
};

api.add(
  "/list",
  [
    method(['POST']),
    validateJson(listPhotosSchema),
  ],
  async (request: ApiRequest) => {
    const params = request.local.json as getPhotosParams;
    try {
      const res = (
        await Photo.getPhotos(params)
      ).map((photo) => {
        return photo.getMinDetails();
      });
      return ApiResponse.json(200, res);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not list photos: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const getPhotoDetailsSchema = {
  type: "object",
  properties: {
    itemId: { type: "string" },
    storageId: { type: "string" },
  },
  required: ["itemId", "storageId"],
};

api.add(
  "/photoDetails",
  buildMiddlewares("GET", getPhotoDetailsSchema),
  async (request: ApiRequest) => {
    const photoService = request.local.photoService as PhotosService;
    const itemId = parseInt(request.getParams.itemId);
    try {
      const res = await photoService.getPhotoDetails(itemId);
      return ApiResponse.json(200, res);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not get photo detail: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

export default api;
