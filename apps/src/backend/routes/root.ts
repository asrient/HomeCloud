import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method } from "../decorators";
import { envConfig } from "../envConfig";

const api = new RouteGroup();

api.add('/config', [
    method(['GET']),
], async (_request: ApiRequest) => {
    const config = {
        passwordPolicy: envConfig.PROFILES_CONFIG.passwordPolicy,
        allowSignups: envConfig.PROFILES_CONFIG.allowSignups,
        listProfiles: envConfig.PROFILES_CONFIG.listProfiles,
        syncPolicy: envConfig.PROFILES_CONFIG.syncPolicy,
    }
    return ApiResponse.json(200, {
        config,
    });
});

export default api;
