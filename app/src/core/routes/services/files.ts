import {
  ApiRequest,
  ApiResponse,
  RequestOriginType,
  RouteGroup,
} from "../../interface";
import {
  method,
  validateQuery,
  fetchStorage,
  fetchFsDriver,
  validateJson,
  relayToAgent,
  envType,
} from "../../decorators";
import {
  addPinnedFolder,
  listPinnedFolders,
  removePinnedFolder,
} from "../../services/files/pinned";
import { Agent, Profile, Storage } from "../../models";
import { FsDriver } from "../../storageKit/interface";
import { generateFileAccessToken } from "../../utils/fileUtils";
import { downloadFile, WatchedFile } from "../../services/files/operations";
import { envConfig, EnvType, StorageType } from "../../envConfig";
import CustomError from "../../customError";
import { getFsDriver } from "../../storageKit/storageHelper";
import fs from "fs";
import { native } from "../../native";

const api = new RouteGroup();

function buildMiddlewares(
  method_: string,
  schema?: any,
  relay = true,
) {
  const middlewares = relay ? [relayToAgent()] : [];
  middlewares.push(method([method_]));
  if (schema) {
    middlewares.push(
      method_ === "GET" ? validateQuery(schema) : validateJson(schema),
    );
  }
  middlewares.push(fetchStorage(), fetchFsDriver());
  return middlewares;
}

const listPinsSchema = {
  type: "object",
  properties: {
    storageId: { type: "number" },
  },
  required: ["storageId"],
};

api.add(
  "/pin/list",
  buildMiddlewares("POST", listPinsSchema),
  async (request: ApiRequest) => {
    const profile = request.profile as Profile;
    try {
      const pins = await listPinnedFolders(profile, [request.local.storage.id]);
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

const downloadSchema = {
  type: "object",
  properties: {
    storageId: { type: "number" },
    fileId: { type: "string" },
  },
  required: ["storageId", "fileId"],
  additionalProperties: false,
};

api.add(
  '/download',
  [
    envType([EnvType.Desktop]),
    ...buildMiddlewares('POST', downloadSchema, false)
  ],
  async (request: ApiRequest) => {
    const fsDriver: FsDriver = request.local.fsDriver;
    const { fileId } = request.local.json;
    try {
      const id = await downloadFile(fsDriver, fileId);
      return ApiResponse.json(200, {
        id,
      });
    } catch (e: any) {
      console.error(e);
      return ApiResponse.fromError(e);
    }
  },
)


const openFileSchema = {
  type: "object",
  properties: {
    storageId: { type: "number" },
    fileId: { type: "string" },
  },
  required: ["storageId", "fileId"],
  additionalProperties: false,
};

const openFileHandler = async (request: ApiRequest) => {

  const { fileId } = request.local.json;
  let fsDriver: FsDriver = request.local.fsDriver;

  if (fsDriver.storageType === StorageType.Local) {
    try {
      await fs.promises.access(fileId);
      if (native) {
        native.open(fileId);
      }
      return ApiResponse.json(200, {
        id: fileId,
      });
    } catch (e) {
      return ApiResponse.fromError(e);
    }
  }

  try {
    const wf = await WatchedFile.start(fileId, fsDriver);
    return ApiResponse.json(200, {
      id: wf.tmpFile,
    });
  } catch (e: any) {
    console.error(e);
    return ApiResponse.fromError(e);
  }
}

// Hitting this endpint will open the file in their respective devices.
api.add(
  '/open/remote',
  [
    envType([EnvType.Desktop]),
    ...buildMiddlewares('POST', openFileSchema)
  ],
  openFileHandler,
)

// This will always open the file in this local device and will not relayed.
api.add(
  '/open/local',
  [
    envType([EnvType.Desktop]),
    ...buildMiddlewares('POST', openFileSchema, false)
  ],
  openFileHandler,
)

export default api;
