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
    required: ['name'],
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
    const data = request.local.json;
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

const deleteProfileSchema = {
    type: 'object',
    properties: {
        password: { type: 'string' },
        profileIds: { type: 'array', items: { type: 'number' } },
    },
    required: ['profileIds'],
    additionalProperties: false,
};

api.add('/delete', [
    method(['POST']),
    authenticate(),
    validateJson(deleteProfileSchema),
], async (request: ApiRequest) => {
    const profile = request.profile! as Profile;
    const { password, profileIds } = request.local.json;
    if (!await profile.validatePassword(password)) {
        return ApiResponse.error(403, 'Invalid password');
    }
    if (!profile.isAdmin) {
        if (profileIds.length > 1) {
            return ApiResponse.error(403, 'Only admins can delete multiple profiles');
        }
        if (profileIds[0] !== profile.id) {
            return ApiResponse.error(403, 'You need to be an admin to delete other profiles');
        }
    }
    const deletingSelf = profileIds.includes(profile.id);
    const deleteCount = await Profile.deleteProfiles(profileIds);
    const resp = ApiResponse.json(201, {
        count: deleteCount,
        logout: deletingSelf,
    });
    if (deletingSelf) {
        logout(resp);
    }
    return resp;
});

const updateProfileSchema = {
    type: 'object',
    properties: {
        password: { type: 'string' },
        newPassword: { type: 'string' },
        name: { type: 'string' },
        username: { type: 'string' },
        isDisabled: { type: 'boolean' },
    },
    additionalProperties: false,
};

api.add('/update', [
    method(['POST']),
    authenticate(),
    validateJson(updateProfileSchema),
], async (request: ApiRequest) => {
    const profile = request.profile! as Profile;
    const { password, ...data } = request.local.json;
    if (!await profile.validatePassword(password)) {
        return ApiResponse.error(403, 'Invalid password');
    }
    delete data.password;
    if (data.newPassword) {
        data.password = data.newPassword;
    }
    delete data.newPassword;
    try {
        await profile.edit(data);
    } catch (e: any) {
        return ApiResponse.error(400, 'Could not update profile', {
            error: e.message
        });
    }
    return ApiResponse.json(200, {
        profile: profile.getDetails(),
    });
});

const loginProfileSchema = {
    type: 'object',
    properties: {
        profileId: { type: 'number' },
        username: { type: 'string' },
        password: { type: 'string' },
    },
    additionalProperties: false,
};

api.add('/login', [
    method(['POST']),
    validateJson(loginProfileSchema),
], async (request: ApiRequest) => {
    let { profileId, username, password } = request.local.json;
    // Disabling profileId based login if requireUsername is true.
    if (envConfig.PROFILES_CONFIG.requireUsername) {
        profileId = null;
    }
    let profile: Profile | null = null;
    if (profileId !== null && profileId !== undefined) {
        profile = await Profile.getProfileById(profileId);
    } else {
        if (!username) {
            return ApiResponse.error(400, 'Username is required');
        }
        profile = await Profile.getProfileByUsername(username);
    }
    if (!profile) {
        return ApiResponse.error(404, 'Profile not found');
    }
    if (!await profile.validatePassword(password)) {
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

export default api;
