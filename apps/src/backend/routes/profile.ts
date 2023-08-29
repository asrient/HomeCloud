import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method, accept, validateJson, authenticate, AuthType } from "../decorators";
import { Profile } from "../models";
import { generateJwt } from "../utils/profileUtils";
import { envConfig } from "../envConfig";

const api = new RouteGroup();

const createProfileSchema = {
    type: 'object',
    properties: {
        username: { type: 'string' },
        name: { type: 'string' },
        password: { type: 'string' },
    },
    required: ['username', 'name'],
    additionalProperties: false,
};

function logout(res: ApiResponse) {
    res.setCookie('jwt', '', 0);
}

function login(profile: Profile, res: ApiResponse) {
    res.setCookie('jwt', generateJwt(profile.id));
}

api.add('/create', [
    method(['POST']),
    validateJson(createProfileSchema),
], async (request: ApiRequest) => {
    const data = request.validatedJson;
    let profile: Profile;
    try {
        profile = await Profile.createProfile(data.username, data.name, data.password);
    }
    catch (e: any) {
        return ApiResponse.error(400, 'Could not create profile', {
            error: e.message
        });
    }
    const resp = ApiResponse.json(201, {
        profile: profile.getDetails(),
    });
    login(profile, resp);
    return resp;
});

const loginProfileSchema = {
    type: 'object',
    properties: {
        username: { type: 'string' },
        password: { type: 'string' },
    },
    required: ['username', 'password'],
    additionalProperties: false,
};

api.add('/login', [
    method(['POST']),
    validateJson(loginProfileSchema),
], async (request: ApiRequest) => {
    const data = request.validatedJson;
    const profile = await Profile.getProfileByUsername(data.username);
    if (!profile) {
        return ApiResponse.error(404, 'Profile not found');
    }
    if (!await profile.validatePassword(data.password)) {
        return ApiResponse.error(403, 'Invalid password');
    }
    const resp = ApiResponse.json(200, {
        profile: profile.getDetails(),
    });
    login(profile, resp);
    return resp;
});

api.add('/logout', [
    method(['POST']),
    authenticate(),
], async (request: ApiRequest) => {
    const profile = request.profile;
    const resp = ApiResponse.json(200, profile!.getDetails());
    logout(resp);
    return resp;
});

api.add('/list', [
    method(['GET']),
    authenticate(AuthType.Optional),
], async (request: ApiRequest) => {
    if (!envConfig.PROFILES_CONFIG.listProfiles && !request.profile?.isAdmin) {
        return ApiResponse.error(403, 'Listing profiles is disabled');
    }
    const offset = parseInt(request.getParams.offset) || 0;
    const limit = parseInt(request.getParams.limit) || 20;
    const profiles = await Profile.getProfiles(offset, limit);
    return ApiResponse.json(200, {
        profiles: profiles.map(profile => profile.getDetails()),
        count: profiles.length,
    });
});

// Samples

api.add('/hello/*', async (request: ApiRequest) => {
    const response = new ApiResponse();
    response.status(200);
    response.json({ message: 'Hello World *', url: request.url, urlParams: request.urlParams });
    return response;
});

export default api;
