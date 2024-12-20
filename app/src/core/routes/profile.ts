import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import {
  method,
  validateJson,
  authenticate,
  AuthType,
  relayToAgent,
} from "../decorators";
import { Profile } from "../models";
import { logout } from "../utils/profileUtils";
import { envConfig } from "../envConfig";
import CustomError from "../customError";

const api = new RouteGroup();

const createProfileSchema = {
  type: "object",
  properties: {
    username: { type: "string" },
    name: { type: "string" },
    password: { type: "string" },
    isAdmin: { type: "boolean" },
    accessControl: { type: "object", additionalProperties: { type: "string" } },
  },
  required: ["name"],
};

api.add(
  "/create",
  [relayToAgent(true), method(["POST"]), authenticate(AuthType.Admin), validateJson(createProfileSchema)],
  async (request: ApiRequest) => {

    if(envConfig.PROFILES_CONFIG.singleProfile) {
      return ApiResponse.fromError(CustomError.security("Cannot create profiles on this device."));
    }

    const data = request.local.json;
    let profile: Profile;
    try {
      profile = await Profile.createProfile({
        username: data.username,
        name: data.name,
        password: data.password,
        isAdmin: data.isAdmin || false,
        accessControl: data.accessControl || null,
      }, request.profile);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not create profile: ${e.message}`;
      return ApiResponse.fromError(e);
    }
    const resp = ApiResponse.json(201, {
      profile: profile.getDetails(true),
    });
    return resp;
  },
);

const deleteProfileSchema = {
  type: "object",
  properties: {
    password: { type: "string" },
    profileIds: { type: "array", items: { type: "number" } },
  },
  required: ["profileIds"],
};

api.add(
  "/delete",
  [relayToAgent(true), method(["POST"]), authenticate(AuthType.Admin), validateJson(deleteProfileSchema)],
  async (request: ApiRequest) => {
    const profile = request.profile! as Profile;
    const { password, profileIds } = request.local.json;
    if (!(await profile.validatePassword(password))) {
      return ApiResponse.fromError(
        CustomError.validationSingle("password", "Invalid password"),
      );
    }
    const deletingSelf = profileIds.includes(profile.id);
    try {
      const deleteCount = await Profile.deleteProfiles(profileIds, profile);
      const resp = ApiResponse.json(201, {
        count: deleteCount,
        logout: deletingSelf,
      });
      if (deletingSelf) {
        logout(resp);
      }
      return resp;
    } catch (e: any) {
      return ApiResponse.fromError(e);
    }
  },
);

const updateProfileProtectedSchema = {
  type: "object",
  properties: {
    password: { type: "string" },
    username: { type: "string" },
    isDisabled: { type: "boolean" },
    isAdmin: { type: "boolean" },
    accessControl: { type: "object", additionalProperties: { type: "string" }, nullable: true },
    name: { type: "string" },
    profileId: { type: "number" },
  },
  required: ["profileId"],
};

api.add(
  "/update",
  [relayToAgent(true), method(["POST"]), authenticate(), validateJson(updateProfileProtectedSchema)],
  async (request: ApiRequest) => {
    const refererProfile = request.profile! as Profile;
    const data = request.local.json;
    const profileId = data.profileId;
    delete data.profileId;
    const profile = await Profile.getProfileById(profileId);
    if (!profile) {
      return ApiResponse.fromError(CustomError.validationSingle('profileId', "Profile not found"));
    }
    if (profile.id !== refererProfile.id && !refererProfile.isAdmin) {
      return ApiResponse.fromError(CustomError.security("Unauthorized"));
    }
    try {
      await profile.edit(data, refererProfile);
    } catch (e: any) {
      return ApiResponse.fromError(e);
    }
    return ApiResponse.json(200, {
      profile: profile.getDetails(true),
    });
  },
);

api.add(
  "/list",
  [relayToAgent(true), method(["GET"]), authenticate(AuthType.Admin)],
  async (request: ApiRequest) => {
    const offset = parseInt(request.getParams.offset) || 0;
    const limit = parseInt(request.getParams.limit) || 20;
    const profiles = await Profile.getProfiles(offset, limit);
    return ApiResponse.json(200, {
      profiles: profiles.map((profile) => profile.getDetails(true)),
      count: profiles.length,
    });
  },
);

export default api;
