import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method, authenticate, AuthType, validateJson } from "../decorators";
import { envConfig, PairingAuthType } from "../envConfig";
import { Profile } from "../models";
import CustomError from "../customError";
import { PairingRequestPacket, registerPairingRequest, verifyOTP } from "../agentKit/pairing";
import { AgentInfo } from "../agentKit/types";
import { getDeviceInfoCached } from "../utils/deviceInfo";
import { getIconKey } from "../utils";

const api = new RouteGroup();

api.add(
  "/agent/info",
  [method(["GET"]), authenticate(AuthType.Optional)],
  async (request: ApiRequest) => {
    const profile = request.profile;
    const availableProfiles = await Profile.getProfiles(0, 100); // TODO: Implement hard limit across the app
    const deviceInfo = getDeviceInfoCached();
    return ApiResponse.json(200, {
      version: envConfig.VERSION,
      deviceName: envConfig.DEVICE_NAME,
      fingerprint: envConfig.FINGERPRINT,
      pairingAuthType: envConfig.PAIRING_AUTH_TYPE,
      deviceInfo,
      iconKey: getIconKey(deviceInfo),
      profile: profile && profile.getDetails(true),
      availableProfiles: availableProfiles.map((p) => p.getDetails()),
    } as AgentInfo);
  },
);

const pairSchema = {
  type: "object",
  properties: {
    packet: {
      type: "object",
      properties: { payload: { type: "string" }, signature: { type: "string" } },
      required: ['payload', 'signature'],
    }, // PairingRequestPacket
    password: { type: "string", nullable: true },
  },
  required: ["packet"],
};

api.add(
  "/agent/pair",
  [method(["POST"]),
  validateJson(pairSchema),
  ],
  async (request: ApiRequest) => {
    const data = request.local.json as { packet: PairingRequestPacket; password: string };

    const clientRemoteAddress = request.remoteAddress;
    const clientPublicKey = request.clientPublicKey();

    if (!clientPublicKey) {
      throw CustomError.validationSingle('publicKey', 'Client Public Key not sent');
    }

    const resp = await registerPairingRequest(data.packet, data.password || null, clientPublicKey, clientRemoteAddress);

    return ApiResponse.json(200, resp);
  },
);

const otpSchema = {
  type: "object",
  properties: {
    token: { type: "string" },
    otp: { type: "string" },
  },
  required: ["token", "otp"],
};

api.add(
  "/agent/otp",
  [method(["POST"]),
  validateJson(otpSchema),
  ],
  async (request: ApiRequest) => {
    const data = request.local.json as { token: string; otp: string };

    if (envConfig.PAIRING_AUTH_TYPE !== PairingAuthType.OTP) {
      throw CustomError.validationSingle('pairingAuthType', 'Pairing Auth Type is not OTP');
    }

    const clientPublicKey = request.clientPublicKey();
    if (!clientPublicKey) {
      throw CustomError.validationSingle('publicKey', 'Client Public Key not sent');
    }

    try {
      const resp = await verifyOTP(data.token, data.otp, clientPublicKey);
      return ApiResponse.json(200, resp);
    } catch (e: any) {
      console.error(e);
      return ApiResponse.fromError(e);
    }
  },
);

export default api;
