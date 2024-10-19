import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method, authenticate, AuthType, validateQuery, validateJson } from "../decorators";
import { envConfig } from "../envConfig";
import { Profile, Storage } from "../models";
import { verifyFileAccessToken } from "../utils/fileUtils";
import CustomError from "../customError";
import { getFsDriverByStorageId } from "../storageKit/storageHelper";
import { login, logout } from "../utils/profileUtils";
import { requestSession, getApprovalStatus } from "../pendingSessions";
import { parseUserAgent } from "../utils/userAgent";

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
    version: envConfig.VERSION,
    deviceName: envConfig.DEVICE_NAME,
    fingerprint: envConfig.FINGERPRINT,
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

const sessionRequestSchema = {
  type: "object",
  properties: {
    fingerprint: { type: "string" },
  },
  additionalProperties: false,
  required: ["fingerprint"],
};

api.add(
  "/session/request",
  [method(["POST"]), validateJson(sessionRequestSchema)],
  async (request: ApiRequest) => {
    let { fingerprint } = request.local.json;

    // check if fingerprint is valid
    if (fingerprint !== envConfig.FINGERPRINT) {
      return ApiResponse.fromError(
        CustomError.validationSingle("fingerprint", "Invalid fingerprint"),
      );
    }

    // Get browser details
    const browserDetails = parseUserAgent(request.userAgent);

    // create a session request
    const token = requestSession({
      userAgent: request.userAgent,
      browserName: browserDetails.browser,
    });

    return ApiResponse.json(200, { token });
  },
);

const checkStatusSchema = {
  type: "object",
  properties: {
    fingerprint: { type: "string" },
    token: { type: "string" },
  },
  additionalProperties: false,
  required: ["fingerprint", "token"],
};

api.add(
  "/session/pollStatus",
  [method(["POST"]), validateJson(checkStatusSchema)],
  async (request: ApiRequest) => {
    const { fingerprint, token } = request.local.json;

    // check if fingerprint is valid
    if (fingerprint !== envConfig.FINGERPRINT) {
      return ApiResponse.fromError(
        CustomError.validationSingle("fingerprint", "Invalid fingerprint"),
      );
    }

    // check status of the session request
    const status = getApprovalStatus(token);
    let profile: Profile | null = null;

    if (status) {
      profile = await Profile.getProfileById(envConfig.DEFAULT_PROFILE_ID);
    }

    const res = ApiResponse.json(200, { status, profile: profile?.getDetails() });
    if (status && profile) {
      login(profile.id, res);
    }
    return res;
  });

  api.add(
    "/session/exit",
    [method(["POST"]), authenticate(AuthType.Required)],
    async (request: ApiRequest) => {
      const profile = request.profile;
      const resp = ApiResponse.json(200, {
        profile: profile?.getDetails(),
        ok: true,
      });
      logout(resp);
      return resp;
    },
  );

const fileTokenSchema = {
  type: 'object',
  properties: {
    download: { type: 'string', enum: ['1', '0'] },
  },
  required: [],
};

api.add(
  '/file/:token',
  [
    method(['GET']),
    validateQuery(fileTokenSchema),
  ],
  async (request: ApiRequest) => {
    const token = request.urlParams.token;
    const isDownload = request.getParams.download === '1';

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
    try {
      const [_storage, fsDriver] = await getFsDriverByStorageId(storageId);
      const [stream, mime] = await fsDriver.readFile(fileId);
      const resp = ApiResponse.stream(
        200,
        stream,
        mime || "application/octet-stream",
      );
      if (isDownload) {
        const stat = await fsDriver.getStat(fileId);
        resp.markAsDownload(stat.name);
      }
      return resp;
    } catch (e: any) {
      console.error(e);
      e.message = `Could not read file: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  }
)

export default api;
