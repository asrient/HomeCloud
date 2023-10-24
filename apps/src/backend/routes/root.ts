import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method, authenticate, AuthType } from "../decorators";
import { envConfig } from "../envConfig";
import { Storage } from "../models";
import { verifyFileAccessToken } from "../utils/fileUtils";
import CustomError from "../customError";
import { getFsDriver } from "../storageKit/storageHelper";

const api = new RouteGroup();

function getConfig() {
  return {
    passwordPolicy: envConfig.PROFILES_CONFIG.passwordPolicy,
    allowSignups: envConfig.PROFILES_CONFIG.allowSignups,
    listProfiles: envConfig.PROFILES_CONFIG.listProfiles,
    requireUsername: envConfig.PROFILES_CONFIG.requireUsername,
    syncPolicy: envConfig.PROFILES_CONFIG.syncPolicy,
    storageTypes: envConfig.ENABLED_STORAGE_TYPES,
    isDev: envConfig.IS_DEV,
  };
}

type StateResponse = {
  config: object;
  profile: object | null;
  storages: object | null;
};

api.add(
  "/state",
  [method(["GET"]), authenticate(AuthType.Optional)],
  async (request: ApiRequest) => {
    const res: StateResponse = {
      config: getConfig(),
      profile: null,
      storages: null,
    };
    if (request.profile) {
      res.profile = request.profile.getDetails();
      const storages = await request.profile.getStorages();
      const promises = storages.map((storage: Storage) => {
        return storage.getDetails();
      });
      res.storages = await Promise.all(promises);
    }
    return ApiResponse.json(200, res);
  },
);

api.add(
  '/file/:token',
  [method(['GET'])],
  async (request: ApiRequest) => {
    const token = request.urlParams.token;
    if (!token) {
      return ApiResponse.fromError(
        CustomError.validationSingle('token', 'Token is required'),
      );
    }
    const payload = verifyFileAccessToken(token as string);
    if (!payload) {
      return ApiResponse.fromError(
        CustomError.validationSingle('token', 'Invalid token'),
      );
    }
    const { storageId, fileId } = payload;
    const storage = await Storage.getById(storageId);
    if (!storage) {
      return ApiResponse.fromError(
        CustomError.validationSingle('storageId', 'Storage not found'),
      );
    }
    try {
      const fsDriver = await getFsDriver(storage);
      const [stream, mime] = await fsDriver.readFile(fileId);
      return ApiResponse.stream(
        200,
        stream,
        mime || "application/octet-stream",
      );
    } catch (e: any) {
      console.error(e);
      e.message = `Could not read file: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  }
)

export default api;
