import {
  ApiRequest,
  ApiResponse,
  RouteGroup,
} from "../../interface";
import {
  method,
  validateQuery,
  validateJson,
  relayToAgent,
} from "../../decorators";
import PhotosService from "../../services/photos/photosService";
import { getPhotosParams } from "../../services/photos/types";

const api = new RouteGroup();

const commonOptions = {
  storageId: { type: "number" },
};

function buildMiddlewares(method_: string, schema?: any) {
  const middlewares = [relayToAgent(), method([method_])];
  if (schema) {
    middlewares.push(
      method_ === "GET" ? validateQuery(schema) : validateJson(schema),
    );
  }
  return middlewares;
}

const deleteSchema = {
  type: "object",
  properties: {
    ids: { type: "array", items: { type: "number" } },
    locationId: { type: "number" },
    ...commonOptions,
  },
  required: ["ids", "locationId"],
};

api.add(
  "/delete",
  buildMiddlewares("POST", deleteSchema),
  async (request: ApiRequest) => {
    const photoService = PhotosService.getInstance();
    const ids = request.local.json.ids as number[];
    const locationId = request.local.json.locationId as number;
    const photoLobrary = photoService.getLibrary(locationId);
    try {
      const res = await photoLobrary.deletePhotos(ids);
      return ApiResponse.json(200, res);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not delete photos: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const listPhotosSchema = {
  type: "object",
  properties: {
    limit: { type: "number" },
    offset: { type: "number" },
    sortBy: { type: "string", enum: ["capturedOn", "itemId", "mimeType", "lastEditedOn", "addedOn", "size", "duration"] },
    ascending: { type: "boolean" },
    libraryId: { type: "number" },
    ...commonOptions,
  },
  required: ["limit", "offset", "sortBy", "libraryId"],
};

api.add(
  "/list",
  [
    relayToAgent(),
    method(['POST']),
    validateJson(listPhotosSchema),
  ],
  async (request: ApiRequest) => {
    const libraryId = request.local.json.libraryId;
    delete request.local.json.libraryId;
    if(request.local.json.storageId) {
      delete request.local.json.storageId;
    }
    const params = request.local.json as getPhotosParams;
    const photoLibrary = PhotosService.getInstance().getLibrary(libraryId);
    try {
      const res = await photoLibrary.getPhotos(params);
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
    id: { type: "string" },
    libraryId: { type: "string" },
    ...commonOptions,
  },
  required: ["id", "libraryId"],
};

api.add(
  "/photoDetails",
  buildMiddlewares("GET", getPhotoDetailsSchema),
  async (request: ApiRequest) => {
    const libraryId = request.local.json.libraryId;
    const photoLibrary = PhotosService.getInstance().getLibrary(parseInt(libraryId));
    const id = parseInt(request.getParams.id);
    try {
      // To Fix: Still returns min details
      const res = await photoLibrary.getPhoto(id);
      return ApiResponse.json(200, res);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not get photo detail: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const addLibrarySchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    location: { type: "string" },
    ...commonOptions,
  },
  required: ["name", "location"],
};

api.add(
  "/library/add",
  buildMiddlewares("POST", addLibrarySchema),
  async (request: ApiRequest) => {
    const photoService = PhotosService.getInstance();
    const name = request.local.json.name as string;
    const location = request.local.json.location as string;
    try {
      const library = await photoService.addLibrary(name, location);
      return ApiResponse.json(201, library);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not add library: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const deleteLibrarySchema = {
  type: "object",
  properties: {
    id: { type: "number" },
    ...commonOptions,
  },
  required: ["id"],
};

api.add(
  "/library/delete",
  buildMiddlewares("POST", deleteLibrarySchema),
  async (request: ApiRequest) => {
    const photoService = PhotosService.getInstance();
    const id = request.local.json.id as number;
    try {
      await photoService.removeLibrary(id);
      return ApiResponse.json(204, {});
    } catch (e: any) {
      console.error(e);
      e.message = `Could not delete library: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

export default api;
