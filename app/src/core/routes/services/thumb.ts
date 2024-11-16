import { ApiRequest, ApiResponse, RouteGroup } from "../../interface";
import {
  method,
  fetchStorage,
  fetchFsDriver,
  validateJson,
} from "../../decorators";
import ThumbService from "../../services/thumb/thumbService";
import { FsDriver } from "../../storageKit/interface";

const api = new RouteGroup();

const getThumbnailSchema = {
  type: "object",
  properties: {
    fileId: { type: "string" },
    storageId: { type: "number" },
    lastUpdated: { type: "number" },
  },
  required: ["fileId"],
};

api.add(
  "/getThumbnail",
  [
    method(["POST"]),
    validateJson(getThumbnailSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const { fileId, lastUpdated } = request.local.json;
    const fsDriver = request.local.fsDriver as FsDriver;
    if (fsDriver.providesThumbnail) {
      try {
        const img = await fsDriver.getThumbnailUrl(fileId);
        return ApiResponse.json(200, {
          fileId,
          updatedAt: null,
          image: img,
          height: null,
          width: null,
        });
      } catch (e: any) {
        e.message = `Could not get thumbnail: ${e.message}`;
        return ApiResponse.fromError(e);
      }
    }
    const thumbService = new ThumbService(fsDriver);
    try {
      let date = new Date(0);
      if (lastUpdated) {
        date = new Date(lastUpdated);
      }
      const thumbDetails = await thumbService.getOrCreateThumb(fileId, date);
      return ApiResponse.json(200, thumbDetails);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not get thumbnail: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

export default api;
