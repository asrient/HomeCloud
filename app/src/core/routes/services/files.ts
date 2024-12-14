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
} from "../../decorators";
import {
  addPinnedFolder,
  listPinnedFolders,
  removePinnedFolder,
} from "../../services/files/pinned";
import { Agent, Profile, Storage } from "../../models";
import { FsDriver, RemoteItem } from "../../storageKit/interface";
import { generateFileAccessToken } from "../../utils/fileUtils";
import { downloadFile, WatchedFile } from "../../services/files/operations";
import { envConfig, StorageType } from "../../envConfig";
import CustomError from "../../customError";
import { getFsDriver, getFsDriverByStorageId } from "../../storageKit/storageHelper";
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

// This will always open the file in this local device and will not relayed.
api.add(
  '/open/local',
  [
    ...buildMiddlewares('POST', openFileSchema, false)
  ],
  openFileHandler,
)

const openFileRemoteSchema = {
  type: "object",
  properties: {
    storageId: { type: "number" },
    fileId: { type: "string" },
    targetDeviceFingerprint: { type: "string" },
    targetProfileId: { type: "number" },
  },
  required: ["storageId", "fileId", "targetDeviceFingerprint", "targetProfileId"],
  additionalProperties: false,
};

// Hitting this endpint will open the file on the storageId device.
api.add(
  '/open/remote',
  [
    ...buildMiddlewares('POST', openFileRemoteSchema)
  ],
  async (request: ApiRequest) => {
    const { targetDeviceFingerprint, targetProfileId } = request.local.json;
    if (targetDeviceFingerprint !== envConfig.FINGERPRINT) {
      const agent = await Agent.getAgent(request.profile, targetDeviceFingerprint, targetProfileId);
      if (!agent) {
        return ApiResponse.fromError(CustomError.generic('Agent not found on device.'));
      }
      const storage = await agent.getStorage();
      request.local.fsDriver = await getFsDriver(storage, request.profile);
      request.local.storage = storage;
    }
    return openFileHandler(request);
  },
)

const moveSchema = {
  type: "object",
  properties: {
    sourceStorageId: { type: "number" },
    destStorageId: { type: "number" },
    sourceFileIds: { type: "array", items: { type: "string" } },
    destDir: { type: "string" },
    deleteSource: { type: "boolean" },
  },
  required: ["sourceStorageId", "destStorageId", "sourceFileIds", "destDir"],
  additionalProperties: false,
};

api.add(
  '/move',
  [
    method(['POST']),
    validateJson(moveSchema),
  ],
  async (request: ApiRequest) => {
    const { sourceStorageId, destStorageId, sourceFileIds, destDir, deleteSource } = request.local.json;
    const sourceStorage = await request.profile.getStorageById(sourceStorageId);
    if (!sourceStorage) {
      return ApiResponse.fromError(CustomError.generic('Source storage not found.'));
    }
    const sourceFsDriver = await getFsDriver(sourceStorage, request.profile);
    if (sourceStorage.id === destStorageId) {
      const promises = sourceFileIds.map(async (sourceFileId: string) => {
        const stat = await sourceFsDriver.getStat(sourceFileId);
        if (stat.type === 'directory') {
          return sourceFsDriver.moveDir(sourceFileId, destDir, stat.name, deleteSource);
        }
        return sourceFsDriver.moveFile(sourceFileId, destDir, stat.name, deleteSource);
      });
      const result = await Promise.allSettled(promises);
      return ApiResponse.json(200, {
        result: result.map((r) => r.status === 'fulfilled' ? r.value : r.reason),
      });
    }
    const destStorage = await request.profile.getStorageById(destStorageId);
    if (!destStorage) {
      return ApiResponse.fromError(CustomError.generic('Destination storage not found.'));
    }
    const destFsDriver = await getFsDriver(destStorage, request.profile);
    const errors: string[] = [];
    const walk = async (sourceFileId: string, destDir: string): Promise<RemoteItem> => {
      const stat = await sourceFsDriver.getStat(sourceFileId);
      if (stat.type === 'directory') {
        const newDir = await destFsDriver.mkDir(stat.name, destDir);
        const children = await sourceFsDriver.readDir(sourceFileId);
        const promises = children.map(async (child, ind) => {
          // delay the next call to avoid too many concurrent requests.
          if (ind > 0) {
            await new Promise((resolve) => setTimeout(resolve, ind * 100));
          }
          return walk(child.id, newDir.id);
        });
        const result = await Promise.allSettled(promises);
        result.forEach((r) => {
          if (r.status === 'rejected') {
            errors.push(r.reason?.message);
          }
        });
        return newDir;
      } else {
        const [stream, mime] = await sourceFsDriver.readFile(sourceFileId);
        try {
          const file = await destFsDriver.writeFile(destDir, {
            stream,
            mime,
            name: stat.name,
          });
          if (deleteSource) {
            await sourceFsDriver.unlink(sourceFileId);
          }
          return file;
        } finally {
          stream.destroy();
        }
      }
    }
    // walk through sourceFileIds in a dfs manner and copy them to destDir
    const promises: Promise<RemoteItem>[] = sourceFileIds.map(async (sourceFileId: string) => {
      return walk(sourceFileId, destDir);
    });
    const result = await Promise.allSettled(promises);
    const addedItems: RemoteItem[] = [];
    result.forEach((r) => {
      if (r.status === 'rejected') {
        errors.push(r.reason?.message);
      } else {
        addedItems.push(r.value);
      }
    });
    console.log('copy cross-storage result', addedItems, errors);
    return ApiResponse.json(200, {
      items: addedItems,
      errors,
    });
  },
)

export default api;
