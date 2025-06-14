import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method, authenticate, AuthType, validateQuery, validateJson } from "../decorators";
import { DeviceInfo, envConfig } from "../envConfig";
import { Storage } from "../models";
import { verifyFileAccessToken } from "../utils/fileUtils";
import CustomError from "../customError";
import { getFsDriverByStorageId } from "../storageKit/storageHelper";
import { login, logout } from "../utils/profileUtils";
import { requestSession, getApprovalStatus } from "../pendingSessions";
import { parseUserAgent } from "../utils/userAgent";
import { getDeviceInfoCached } from "../utils/deviceInfo";
import { getIconKey } from "../utils";

const api = new RouteGroup();

function getConfig() {
  return {
    storageTypes: envConfig.ENABLED_STORAGE_TYPES,
    isDev: envConfig.IS_DEV,
    version: envConfig.VERSION,
    deviceName: envConfig.DEVICE_NAME,
    fingerprint: envConfig.FINGERPRINT,
    userName: envConfig.USER_NAME,
  };
}

type StateResponse = {
  config: object;
  deviceInfo: DeviceInfo;
  storages: object | null;
  iconKey: string;
  isAuthenticated: boolean;
};

api.add(
  "/state",
  [method(["GET"]), authenticate(AuthType.Optional)],
  async (request: ApiRequest) => {
    const deviceInfo = getDeviceInfoCached();
    const res: StateResponse = {
      config: getConfig(),
      deviceInfo,
      iconKey: getIconKey(deviceInfo),
      storages: null,
      isAuthenticated: request.local.isAuthenticated,
    };
    if (request.local.isAuthenticated) {
      const storages = await Storage.getAllStorages();
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

    try {
    // check status of the session request
    const status = getApprovalStatus(token);
    const res = ApiResponse.json(200, { status });
    if (status) {
      login(res);
    }
    return res;
    } catch (e: any) {
      return ApiResponse.fromError(e);
    }
  });

  api.add(
    "/session/exit",
    [method(["POST"]), authenticate(AuthType.Required)],
    async (request: ApiRequest) => {
      const resp = ApiResponse.json(200, {
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
