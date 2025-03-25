import { ApiRequest, ApiResponse, RouteGroup } from "../../interface";
import {
  method,
  fetchStorage,
  fetchFsDriver,
  validateJson,
  relayToAgent,
} from "../../decorators";
import ThumbService from "../../services/thumb/thumbService";
import { FsDriver } from "../../storageKit/interface";
import { Storage } from "../../models";
import { getFsDriver } from "../../storageKit/storageHelper";

const api = new RouteGroup();

const getThumbnailSchema = {
  type: "object",
  properties: {
    fileId: { type: "string" },
    storageId: { type: "number" },
  },
  required: ["fileId"],
};

api.add(
  "/getThumbnail",
  [
    relayToAgent(),
    method(["POST"]),
    validateJson(getThumbnailSchema),
  ],
  async (request: ApiRequest) => {
    const { fileId } = request.local.json;
    const { storage } = request.local as { storage: Storage };

    if(!!storage && !storage.isLocalType()) {
      const fsDriver = await getFsDriver(storage);
      if (fsDriver.providesThumbnail) {
        try {
          const img = await fsDriver.getThumbnailUrl(fileId);
          return ApiResponse.json(200, img);
        } catch (e: any) {
          e.message = `Could not get thumbnail: ${e.message}`;
          return ApiResponse.fromError(e);
        }
      } else {
        return ApiResponse.fromError(new Error("Storage does not support thumbnail"));
      }
    }

    const thumbService = ThumbService.getInstace();
    try {
      const img = await thumbService.generateThumbnailURI(fileId);
      return ApiResponse.json(200, img);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not get thumbnail: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

export default api;
