import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import {
  method,
  validateJson,
  authenticate,
  validateQuery,
  fetchStorage,
  fetchFsDriver,
} from "../decorators";
import { Storage } from "../models";
import { StorageTypes, StorageAuthTypes, StorageAuthType, envConfig } from "../envConfig";
import { initiate, complete } from "../storageKit/oneAuth";
import { FsDriver } from "../storageKit/interface";
import CustomError from "../customError";
import { joinUrlPath } from "../utils";

const api = new RouteGroup();

const commonStorageOptions = {
  url: { type: "string" },
  name: { type: "string" },
  secret: { type: "string" },
  username: { type: "string" },
  authType: {
    type: "string",
    enum: StorageAuthTypes,
  },
};

const addStorageSchema = {
  type: "object",
  properties: {
    ...commonStorageOptions,
    type: {
      type: "string",
      enum: StorageTypes,
    },
  },
  required: ["type", "authType"],
  additionalProperties: false,
};

api.add(
  "/add",
  [method(["POST"]), authenticate(), validateJson(addStorageSchema)],
  async (request: ApiRequest) => {
    const data = request.local.json;
    const profile = request.profile!;
    if (data.authType === StorageAuthType.OneAuth) {
      try {
        const { pendingAuth, authUrl } = await initiate(profile, data.type);
        return ApiResponse.json(201, {
          pendingAuth: pendingAuth.getDetails(),
          authUrl,
        });
      } catch (e: any) {
        console.error(e);
        e.message = `Could not initiate auth: ${e.message}`;
        return ApiResponse.fromError(e);
      }
    }
    try {
      const storage = await Storage.createStorage(profile, data);
      return ApiResponse.json(201, {
        storage: await storage.getDetails(),
      });
    } catch (e: any) {
      e.message = `Could not create storage: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const completeStorageSchema = {
  type: "object",
  properties: {
    referenceId: { type: "string" },
    partialCode2: { type: "string" },
  },
  required: ["referenceId", "partialCode2"],
  additionalProperties: false,
};

api.add(
  "/callback",
  [method(["GET"]), validateQuery(completeStorageSchema)],
  async (request: ApiRequest) => {
    const { referenceId, partialCode2 } = request.getParams;
    try {
      const storage = await complete(referenceId, partialCode2);
      const redirectUrl = joinUrlPath(envConfig.BASE_URL, `/settings/storage?id=${storage.id}`);
      return ApiResponse.redirect(redirectUrl);
    } catch (e: any) {
      return ApiResponse.fromError(e);
    }
  },
);

const editStorageSchema = {
  type: "object",
  properties: {
    ...commonStorageOptions,
    storageId: { type: "number" },
  },
  required: ["storageId"],
  additionalProperties: false,
};

api.add(
  "/edit",
  [method(["POST"]), authenticate(), validateJson(editStorageSchema)],
  async (request: ApiRequest) => {
    const data = request.local.json;
    const profile = request.profile!;
    let storage = await profile.getStorageById(data.storageId);
    if (!storage) {
      return ApiResponse.fromError(
        CustomError.validationSingle("storageId", "Storage not found"),
      );
    }
    try {
      storage = await storage.edit(data);
    } catch (e: any) {
      return ApiResponse.fromError(e);
    }
    const resp = ApiResponse.json(201, {
      storage: await storage.getDetails(),
    });
    return resp;
  },
);

const deleteStorageSchema = {
  type: "object",
  properties: {
    storageId: { type: "number" },
  },
  required: ["storageId"],
  additionalProperties: false,
};

api.add(
  "/delete",
  [method(["POST"]), authenticate(), validateJson(deleteStorageSchema)],
  async (request: ApiRequest) => {
    const data = request.local.json;
    const profile = request.profile!;
    const storage = await profile.getStorageById(data.storageId);
    if (!storage) {
      return ApiResponse.fromError(
        CustomError.validationSingle("storageId", "Storage not found"),
      );
    }
    try {
      await storage.delete();
    } catch (e: any) {
      return ApiResponse.fromError(e);
    }
    const resp = ApiResponse.json(201, {
      deleted: true,
      storageId: data.storageId,
    });
    return resp;
  },
);

const testStorageSchema = {
  type: "object",
  properties: {
    storageId: { type: "string" },
  },
  required: ["storageId"],
};

api.add(
  "/test",
  [
    method(["GET"]),
    authenticate(),
    validateQuery(testStorageSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const storage = request.local.storage as Storage;
    const fsDriver = request.local.fsDriver as FsDriver;
    try {
      const contents = await fsDriver.readRootDir();

      const resp = ApiResponse.json(200, {
        storage: await storage.getDetails(),
        contents,
      });
      return resp;
    } catch (e: any) {
      console.error(e);
      return ApiResponse.fromError(e);
    }
  },
);

export default api;
