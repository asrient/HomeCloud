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
import {
  addPinnedFolder,
  listPinnedFolders,
  removePinnedFolder,
} from "../../services/files/pinned";
import { Profile, Storage } from "../../models";
import { FsDriver } from "../../storageKit/interface";
import { generateFileAccessToken } from "../../utils/fileUtils";

const api = new RouteGroup();

function buildMiddlewares(
  method_: string,
  schema?: any,
  requireStorage = true,
) {
  const middlewares = [method([method_])];
  if (schema) {
    middlewares.push(
      method_ === "GET" ? validateQuery(schema) : validateJson(schema),
    );
  }
  if (requireStorage) {
    middlewares.push(fetchStorage(), fetchFsDriver());
  }
  return middlewares;
}

const listPinsSchema = {
  type: "object",
  properties: {
    storageIds: {
      type: "array",
      items: { type: "number" },
    },
  },
  required: ["storageIds"],
};

api.add(
  "/pin/list",
  buildMiddlewares("POST", listPinsSchema, false),
  async (request: ApiRequest) => {
    const {
      storageIds,
    }: {
      storageIds: number[];
    } = request.local.json;
    const profile = request.profile as Profile;
    console.log(storageIds, profile);
    try {
      const pins = await listPinnedFolders(profile, storageIds);
      return ApiResponse.json(200, {
        ok: true,
        pins: pins.map((pin) => pin.getDetails()),
      });
    } catch (e: any) {
      console.error(e);
      e.message = `Could not list pinned folders: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const addPinSchema = {
  type: "object",
  properties: {
    storageId: { type: "number" },
    folderId: { type: "string" },
  },
  required: ["storageId", "folderId"],
  additionalProperties: false,
};

api.add(
  "/pin/add",
  buildMiddlewares("POST", addPinSchema),
  async (request: ApiRequest) => {
    const {
      folderId,
    }: {
      storageId: number;
      folderId: string;
    } = request.local.json;
    const storage = request.local.storage;
    const fsDriver = request.local.fsDriver as FsDriver;
    let name = "";

    try {
      const stat = await fsDriver.getStat(folderId);
      if (stat.type !== "directory") {
        throw new Error("Path is not a folder");
      }
      name = stat.name;
    } catch (e: any) {
      console.error(e);
      e.message = `Could not get folder: ${e.message}`;
      return ApiResponse.fromError(e);
    }

    try {
      const pin = await addPinnedFolder(storage, folderId, name);
      return ApiResponse.json(200, {
        ok: true,
        pin: pin.getDetails(),
      });
    } catch (e: any) {
      console.error(e);
      e.message = `Could not add pinned folder: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const removePinSchema = {
  type: "object",
  properties: {
    storageId: { type: "number" },
    folderId: { type: "string" },
  },
  required: ["storageId", "folderId"],
  additionalProperties: false,
};

api.add(
  "/pin/remove",
  buildMiddlewares("POST", removePinSchema),
  async (request: ApiRequest) => {
    const {
      folderId,
    }: {
      folderId: string;
    } = request.local.json;
    const storage = request.local.storage;

    try {
      await removePinnedFolder(storage, folderId);
      return ApiResponse.json(200, {
        ok: true,
      });
    } catch (e: any) {
      console.error(e);
      e.message = `Could not remove pinned folder: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const fileTokenSchema = {
  type: "object",
  properties: {
    storageId: { type: "number" },
    fileId: { type: "string" },
  },
  required: ["storageId", "fileId"],
  additionalProperties: false,
};

api.add(
  '/fileToken',
  buildMiddlewares('POST', fileTokenSchema),
  async (request: ApiRequest) => {
    const storage: Storage = request.local.storage;
    const { fileId } = request.local.json;
    try {
      const token = generateFileAccessToken(storage.id, fileId);
      return ApiResponse.json(200, {
        token,
      });
    } catch (e: any) {
      console.error(e);
      e.message = `Could not generate file token: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
)

export default api;
