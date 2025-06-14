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
import { StorageTypes, StorageAuthTypes, StorageAuthType, envConfig, StorageType } from "../envConfig";
import { initiate, complete } from "../storageKit/oneAuth";
import { FsDriver } from "../storageKit/interface";
import CustomError from "../customError";
import { joinUrlPath } from "../utils";
import { requestPairing, sendOTP } from "../agentKit/client";

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
    if(data.authType === StorageAuthType.Pairing) {
      return ApiResponse.fromError(
        CustomError.validationSingle("authType", "Pairing is not supported"), 400);
    }
    if (data.authType === StorageAuthType.OneAuth) {
      try {
        const { pendingAuth, authUrl } = await initiate(data.type);
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
      const storage = await Storage.createStorage(data);
      return ApiResponse.json(201, {
        storage: await storage.getDetails(),
      });
    } catch (e: any) {
      e.message = `Could not create storage: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const addPairingStorageSchema = {
  type: "object",
  properties: {
    host: { type: "string" },
    fingerprint: { type: "string" },
    password: { type: "string" },
  },
  required: ["host", "fingerprint"],
  additionalProperties: false,
};

api.add(
  "/pair",
  [method(["POST"]), authenticate(), validateJson(addPairingStorageSchema)],
  async (request: ApiRequest) => {
    const data = request.local.json as {
      host: string;
      fingerprint: string;
      password: string;
    };
    try {
      const { storage, token } = await requestPairing( data.host, data.fingerprint, data.password || null);
      const requireOTP = !!(!storage && token);
      return ApiResponse.json(201, {
        requireOTP,
        storage: await storage?.getDetails(),
        token,
      });
    } catch (e: any) {
      console.error(e);
      return ApiResponse.fromError(e);
    }
  },
);

const otpSchema = {
  type: "object",
  properties: {
    token: { type: "string" },
    otp: { type: "string" },
    host: { type: "string" },
    fingerprint: { type: "string" },
  },
  required: ["token", "otp", "host", "fingerprint"],
  additionalProperties: false,
};

api.add(
  "/otp",
  [method(["POST"]), authenticate(), validateJson(otpSchema)],
  async (request: ApiRequest) => {
    const data = request.local.json as { token: string; otp: string, host: string, fingerprint: string };
    try {
      const storage = await sendOTP(data.host, data.fingerprint, data.token, data.otp);
      return ApiResponse.json(201, { storage: await storage.getDetails() });
    } catch (e: any) {
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
    let storage = await Storage.getById(data.storageId);
    if (!storage) {
      return ApiResponse.fromError(
        CustomError.validationSingle("storageId", "Storage not found"),
      );
    }
    if(storage.authType === StorageAuthType.Pairing) {
      return ApiResponse.fromError(
        CustomError.validationSingle("storageId", "Storage of pairing type cannot be edited."), 400);
    }
    if(storage.type === StorageType.Local) {
      return ApiResponse.fromError(
        CustomError.validationSingle("storageId", "Storage of local type cannot be edited."), 400);
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
    const storage = await Storage.getById(data.storageId);
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
      const contents = await fsDriver.readDir('');

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
