import { AGENT_TOKEN_HEADER, ApiRequest, ApiResponse, WEB_TOKEN_HEADER } from "./interface";
import { RequestOriginType } from "./envConfig";
import { makeDecorator } from "./utils";
import Ajv, { ErrorObject } from "ajv";
import { verifyJwt } from "./utils/profileUtils";
import { Storage, Agent } from "./models";
import { getFsDriver } from "./storageKit/storageHelper";
import CustomError, { ErrorCode } from "./customError";
import { getFingerprintFromBase64 } from "./utils/cryptoUtils";
import { getClientFromStorage } from "./agentKit/client";

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

async function loadJsonBody(request: ApiRequest) {
  if (request.local.json || !request.isJson || request.method === "GET") {
    return;
  }
  try {
    const data = await request.json();
    request.local.json = data;
  } catch (e: any) {
    throw CustomError.generic(`Could not parse json: ${e.message}`);
  }
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
    try {
      await loadJsonBody(request);
    } catch (e: any) {
      return ApiResponse.fromError(e);
    }
    if (!validator(request.local.json) && validator.errors) {
      return ApiResponse.fromError(parseJsonValidatorErrors(validator.errors));
    }
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
    request.local.isAuthenticated = false;
    let token = request.headers[
      request.requestOrigin === RequestOriginType.Web ? WEB_TOKEN_HEADER : AGENT_TOKEN_HEADER
    ];
    if (!token && request.cookies.jwt) {
      // console.warn("DEV feature: Fetching jwt from cookie.");
      token = request.cookies.jwt;
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
    const { fingerprint, agentId, type } = data;

    if (type !== request.requestOrigin) {
      return ApiResponse.fromError(
        CustomError.security('Invalid token type.'),
        401,
      );
    }

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

    request.local.isAuthenticated = true;
    return next();
  });
}

async function getStorageFromRequest(request: ApiRequest) {
  if (request.local.storage) {
    return;
  }
  let storageId = request.headers["x-storage-id"];
  if (!storageId && request.local.json && request.local.json.storageId) {
    storageId = request.local.json.storageId;
  }
  if (!storageId && request.getParams.storageId) {
    storageId = request.getParams.storageId;
  }
  if (!storageId) {
    throw CustomError.validationSingle("storageId", "Storage id is required");
  }
  const storage = await Storage.getById(parseInt(storageId));
  if (!storage) {
    throw CustomError.validationSingle("storageId", "Storage not found");
  }
  request.local.storage = storage;
}

export function fetchStorage() {
  return makeDecorator(async (request, next) => {
    // console.log("Fetch storage", request.requestOrigin);
    if (request.requestOrigin === RequestOriginType.Web) {
      try {
        await getStorageFromRequest(request);
      } catch (e: any) {
        return ApiResponse.fromError(e);
      }
    }
    else if (request.requestOrigin === RequestOriginType.Agent) {
      request.local.storage = await Storage.getLocalStorage();
    }
    else {
      return ApiResponse.fromError(
        CustomError.generic(`Request origin type: ${request.requestOrigin} not supported by fetchStorage.`),
      );
    }
    return next();
  });
}

export function fetchFsDriver() {
  return makeDecorator(async (request, next) => {
    const storage = request.local.storage;
    if (!storage) {
      return ApiResponse.fromError(
        CustomError.validationSingle("storageId", "Storage not found"),
      );
    }
    try {
      const fsDriver = await getFsDriver(storage);
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

/**
 * Sample usage of the callbacks:
 * const fixResponse = async (resp: ApiResponse) => {
    if (resp.isJson()) {
      const blob = await resp.getBody();
      const text = await blob.text();
      let json = JSON.parse(text);
      // Do something with the json
      resp.json(json);
    }
  };
*/
export function relayToAgent(allowNoStorage = false, reqCb?: (request: ApiRequest) => Promise<void>, respCb?: (resp: ApiResponse) => Promise<void>) {
  return makeDecorator(async (request, next) => {
    const requestOrigin = request.requestOrigin;
    if (requestOrigin === RequestOriginType.Agent) {
      return next();
    }
    try {
      await loadJsonBody(request);
    } catch (e: any) {
      return ApiResponse.fromError(e);
    }
    let storageFound = false;
    try {
      await getStorageFromRequest(request);
      storageFound = true;
    } catch (e: any) {
      storageFound = false;
    }
    // We are considering no storageId sent as intended for local.
    if (!storageFound && allowNoStorage) {
      return next();
    }
    const storage = request.local.storage;
    if (!storage.isAgentType()) {
      return next();
    }
    const agentClient = await getClientFromStorage(storage);
    if (!agentClient) {
      return ApiResponse.fromError(
        CustomError.validationSingle("storageId", "Agent client not found"),
      );
    }
    if (request.getParams.storageId) {
      delete request.getParams.storageId;
    }
    if (reqCb) {
      try {
        await reqCb(request);
      } catch (e: any) {
        console.error(e);
        return ApiResponse.fromError(e);
      }
    }
    const resp = await agentClient.relayApiRequest(request);
    if (respCb) {
      try {
        await respCb(resp);
      } catch (e: any) {
        console.error(e);
        return ApiResponse.fromError(e);
      }
    }
    return resp;
  });
}
