import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method, authenticate, AuthType } from "../decorators";
import { envConfig } from "../envConfig";
import { Storage } from "../models";

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

export default api;
