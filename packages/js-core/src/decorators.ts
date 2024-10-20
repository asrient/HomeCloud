import { ApiResponse, RequestOriginType } from "./interface";
import { makeDecorator } from "./utils";
import isType from "type-is";
import Ajv, { ErrorObject } from "ajv";
import { verifyJwt } from "./utils/profileUtils";
import { Profile, Storage, Agent } from "./models";
import { getFsDriver } from "./storageKit/storageHelper";
import PhotosService from "./services/photos/photosService";
import { FsDriver } from "./storageKit/interface";
import CustomError, { ErrorCode } from "./customError";
import { getFingerprintFromBase64 } from "./utils/cryptoUtils";

const ajv = new Ajv();

export function method(args: any[]) {
  return makeDecorator(async (request, next) => {
    if (!args.includes(request.method)) {
      return ApiResponse.fromError(
        CustomError.security("Method not allowed"),
        405,
      );
    }
    return next();
  });
}

export function accept(args: any[]) {
  return makeDecorator(async (request, next) => {
    if (!isType.is(request.contentType, args)) {
      return ApiResponse.fromError(
        CustomError.security(
          `Content type is not accepted. Allowed: ${args.join(
            ", ",
          )}. Received: ${request.contentType}`,
        ),
        406,
      );
    }
    return next();
  });
}

function parseJsonValidatorErrors(errors: ErrorObject[]) {
  const errorsMap: { [key: string]: string[] } = {};
  errors.forEach((err: ErrorObject) => {
    const prop = err.propertyName || "root";
    if (!errorsMap[prop]) {
      errorsMap[prop] = [];
    }
    errorsMap[prop].push(err.message || "Invalid value");
  });
  return CustomError.validation(errorsMap);
}

export function validateJson(schema: any) {
  const validator = ajv.compile(schema);

  return makeDecorator(async (request, next) => {
    if (!request.isJson) {
      return ApiResponse.fromError(
        CustomError.generic("Content type is not json"),
        406,
      );
    }
    let data;
    try {
      data = await request.json();
    } catch (e: any) {
      return ApiResponse.fromError(
        CustomError.generic(`Could not parse json: ${e.message}`),
      );
    }
    if (!validator(data) && validator.errors) {
      return ApiResponse.fromError(parseJsonValidatorErrors(validator.errors));
    }
    request.local.json = data;
    return next();
  });
}

export function validateQuery(schema: any) {
  const validator = ajv.compile(schema);

  return makeDecorator(async (request, next) => {
    const data = request.getParams;
    if (!validator(data) && validator.errors) {
      return ApiResponse.fromError(parseJsonValidatorErrors(validator.errors));
    }
    return next();
  });
}

export enum AuthType {
  Required,
  Optional,
  Admin,
}

const requiredAuthTypes = [AuthType.Admin, AuthType.Required];

export function authenticate(authType: AuthType = AuthType.Required) {
  return makeDecorator(async (request, next) => {
    let token = request.cookies.jwt;
    if (request.requestOrigin === RequestOriginType.Agent) {
      token = request.headers['x-access-key'];
    }
    const data = verifyJwt(token);
    if (!data) {
      if (requiredAuthTypes.includes(authType)) {
        return ApiResponse.fromError(
          CustomError.security("Authentication required"),
          401,
        );
      }
      return next();
    }
    const { profileId, fingerprint, agentId } = data;

    if (!!agentId && request.requestOrigin === RequestOriginType.Web) {
      return ApiResponse.fromError(
        CustomError.security('Invalid access key.'),
        401,
      );
    }

    const profile = await Profile.getProfileById(profileId);
    if (!profile && requiredAuthTypes.includes(authType)) {
      return ApiResponse.fromError(
        CustomError.security("Authentication required"),
        401,
      );
    }

    if (authType === AuthType.Admin && !profile?.isAdmin) {
      return ApiResponse.fromError(
        CustomError.security("Admin access required"),
        403,
      );
    }
    request.profile = profile;

    if (request.requestOrigin === RequestOriginType.Agent) {
      // Vaildate fingerprint in socket with fingerprint in jwt.
      const clientPK = request.clientPublicKey();
      if (!clientPK) {
        return ApiResponse.fromError(
          CustomError.security('No client public key found.'),
          401,
        );
      }
      const clientFingerprint = getFingerprintFromBase64(clientPK);
      if (fingerprint && clientFingerprint !== fingerprint) {
        return ApiResponse.fromError(
          CustomError.security('Client fingerprint mismatch.'),
          401,
        );
      }
      const agent = await Agent.getAgentById(agentId);
      if (requiredAuthTypes.includes(authType) && !agent) {
        return ApiResponse.fromError(
          CustomError.security('Client agent invalid.'),
          401,
        );
      }
      if (requiredAuthTypes.includes(authType) && !agent.hasClientAccess()) {
        return ApiResponse.fromError(
          CustomError.security('Client access denied.'),
          401,
        );
      }
      request.local.clientAgent = agent;
    }
    return next();
  });
}

export function fetchStorage() {
  return makeDecorator(async (request, next) => {
    console.log("Fetch storage");
    let storage: Storage = null;
    if (request.requestOrigin === RequestOriginType.Web) {
      let storageId = request.headers["x-storage-id"];
      if (!storageId && request.local.json && request.local.json.storageId) {
        storageId = request.local.json.storageId;
      }
      if (!storageId && request.getParams.storageId) {
        storageId = request.getParams.storageId;
      }
      if (!storageId) {
        return ApiResponse.fromError(
          CustomError.validationSingle("storageId", "Storage id is required"),
        );
      }
      storage = await request.profile!.getStorageById(parseInt(storageId));
    }
    else if (request.requestOrigin === RequestOriginType.Agent) {
      storage = await request.profile?.getLocalStorage();
    }
    else {
      return ApiResponse.fromError(
        CustomError.generic(`Request origin type: ${request.requestOrigin} not supported by fetchStorage.`),
      );
    }

    if (!storage) {
      return ApiResponse.fromError(
        CustomError.validationSingle("storageId", "Storage not found"),
      );
    }
    request.local.storage = storage;
    return next();
  });
}

export function fetchFsDriver() {
  return makeDecorator(async (request, next) => {
    const storage = request.local.storage;
    try {
      const fsDriver = await getFsDriver(storage, request.profile);
      request.local.fsDriver = fsDriver;
    } catch (e: any) {
      console.error(e);
      return ApiResponse.fromError(
        CustomError.code(
          ErrorCode.FS_DRIVER_FETCH,
          `Fetch fs driver: ${e.message}`,
        ),
      );
    }
    return next();
  });
}

export function fetchPhotoService() {
  return makeDecorator(async (request, next) => {
    const storage: Storage = request.local.storage;
    const fsDriver: FsDriver = request.local.fsDriver;
    const storageMeta = await storage.getStorageMeta();
    if (!storageMeta) {
      return ApiResponse.fromError(
        CustomError.code(
          ErrorCode.STORAGE_FETCH,
          "Storage meta not found for storage",
        ),
      );
    }
    request.local.photoService = new PhotosService(fsDriver, storageMeta);
    return next();
  });
}
