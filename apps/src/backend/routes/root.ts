import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method, authenticate } from "../decorators";
import { envConfig } from "../envConfig";

const api = new RouteGroup();

api.add('/config', [
    method(['GET']),
], async (_request: ApiRequest) => {
    const config = {
        passwordPolicy: envConfig.PROFILES_CONFIG.passwordPolicy,
        allowSignups: envConfig.PROFILES_CONFIG.allowSignups,
        listProfiles: envConfig.PROFILES_CONFIG.listProfiles,
        requireUsername: envConfig.PROFILES_CONFIG.requireUsername,
        syncPolicy: envConfig.PROFILES_CONFIG.syncPolicy,
        storageTypes: envConfig.ENABLED_STORAGE_TYPES,
    }
    return ApiResponse.json(200, {
        config,
    });
});

api.add('/myState', [
    method(['GET']),
    authenticate(),
], async (request: ApiRequest) => {
    const profile = request.profile!;
    const storages = await profile.getStorages();
    return ApiResponse.json(200, {
        profile: profile.getDetails(),
        storages: storages.map(storage => storage.getDetails()),
    });
});

export default api;
