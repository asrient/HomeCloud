import qs, { ParsedQs } from "qs";
import isType from "type-is";
import * as cookie from "cookie";
import mime from "mime";
import { match } from "node-match-path";
import { envConfig } from "./envConfig";
import { Profile } from "./models";
import { Readable } from "stream";
import CustomError, { ErrorType, ErrorResponse } from "./customError";
import { streamToBuffer } from "./utils";
import fs from "fs/promises";

export const WEB_TOKEN_HEADER = "x-web-token";
export const WEB_TOKEN_HEADER_CAP = "X-Web-Token";
export const AGENT_TOKEN_HEADER = "x-access-key";

export type ApiRequestFile = {
  name: string;
  mime: string;
  stream: Readable;
};

/**
 * Enum representing the origin type of a request.
 * @enum {string}
 */
export enum RequestOriginType {
  Web = 'Web',
  Agent = 'Agent',
}

/**
 * Class representing an API request.
 */
export class ApiRequest {
  /**
   * Query parameters of the request.
   * @type {Object.<string, string>}
   */
  getParams: { [key: string]: string } = {};

  /**
   * URL of the request.
   * @type {URL}
   */
  url: URL;

  /**
   * URL parameters of the request.
   * @type {Object.<string, string | string[] | ParsedQs | ParsedQs[] | undefined>}
   */
  urlParams: {
    [key: string]: string | string[] | ParsedQs | ParsedQs[] | undefined;
  } = {};

  /**
   * Matched pattern of the request.
   * @type {string}
   */
  matchedPattern: string = "/api";

  /**
   * Headers of the request.
   * @type {Object.<string, string>}
   */
  headers: { [key: string]: string };

  /**
   * Cookies of the request.
   * @type {Object.<string, string>}
   */
  cookies: { [key: string]: string } = {};

  /**
   * HTTP method of the request.
   * @type {string}
   */
  method: string;

  /**
   * Local variables for the request.
   * @type {any}
   */
  local: any = {};

  /**
   * Origin type of the request.
   * @type {RequestOriginType}
   */
  requestOrigin: RequestOriginType;

  /**
   * Profile associated with the request.
   * @type {Profile | null}
   */
  profile: Profile | null = null;

  /**
   * Remote address of the request.
   * @type {string | null}
   */
  remoteAddress: string | null = null;

  /**
   * Creates an instance of ApiRequest.
   * @param {string} method - HTTP method of the request.
   * @param {string | URL} url - URL of the request.
   * @param {Object.<string, string>} headers - Headers of the request.
   * @param {(() => Promise<Buffer>) | null} [body=null] - Function to get the body of the request.
   * @param {((cb: (type: "file" | "field", file: ApiRequestFile | any) => Promise<void>) => Promise<void>) | null} [fetchMultipartForm=null] - Function to fetch multipart form data.
   * @param {RequestOriginType} requestOrigin - Origin type of the request.
   * @param {(() => string | null)} clientPublicKey - Function to get the client public key.
   * @param {string | null} remoteAddress - Remote address of the request.
   */
  constructor(
    method: string,
    url: string | URL,
    headers: { [key: string]: string },
    public body: (() => Promise<Buffer>) | null = null,
    public fetchMultipartForm:
      | ((
        cb: (
          type: "file" | "field",
          file: ApiRequestFile | any,
        ) => Promise<void>,
      ) => Promise<void>)
      | null = null,
    public bodyStream: Readable | null = null,
    requestOrigin: RequestOriginType,
    public clientPublicKey: (() => string | null),
    remoteAddress: string | null,
  ) {
    this.method = method.toUpperCase();
    this.requestOrigin = requestOrigin;
    this.remoteAddress = remoteAddress;

    if (typeof url === "string") {
      if (url.endsWith("/") && url.length > 1) {
        url = url.substring(0, url.length - 1);
      }
      this.url = new URL(url);
    } else {
      this.url = url;
    }

    const params = qs.parse(this.url.search, { ignoreQueryPrefix: true });
    for (const key in params) {
      this.getParams[key] = params[key] as string;
    }

    this.headers = {};
    for (const key in headers) {
      this.headers[key.toLowerCase()] = headers[key];
    }
    if (this.cookieString) {
      this.cookies = cookie.parse(this.cookieString);
    }
  }
  get mayContainFiles() {
    return (
      this.method === "POST" &&
      this.headers["content-type"]?.includes("multipart/form-data")
    );
  }
  get path() {
    return this.url.pathname;
  }
  get queryString() {
    return this.url.search;
  }
  get hash() {
    return this.url.hash;
  }
  get origin() {
    return this.url.origin;
  }
  get host() {
    return this.url.host;
  }
  get protocol() {
    return this.url.protocol;
  }
  get contentType() {
    return this.headers["content-type"];
  }
  get userAgent() {
    return this.headers["user-agent"];
  }
  get cookieString() {
    return this.headers["cookie"];
  }
  get webToken() {
    return this.headers[WEB_TOKEN_HEADER];
  }
  get isJson() {
    return isType.is(this.contentType, ["json"]) === "json";
  }
  get isText() {
    return isType.is(this.contentType, ["text"]) === "text";
  }
  async json(): Promise<any> {
    if (!this.body) {
      throw new Error("Body is null");
    }
    if (!this.isJson) {
      throw new Error("Content type is not json");
    }
    return JSON.parse((await this.body()).toString("utf8"));
  }

  /**
   * Asynchronously retrieves the text content of the request body.
   * @returns {Promise<string>} A promise that resolves to the text content of the request body.
   * @throws {Error} If the body is null or the content type is not text.
   */
  async text(): Promise<string> {
    if (!this.body) {
      throw new Error("Body is null");
    }
    if (!this.isText) {
      throw new Error("Content type is not text");
    }
    return (await this.body()).toString();
  }
}

/**
 * Class representing an API response.
 */
export class ApiResponse {
  /**
   * HTTP status code of the response.
   * @type {number}
   */
  statusCode: number = 200;

  /**
   * Headers of the response.
   * @type {Object.<string, string>}
   */
  headers: { [key: string]: string } = {};

  /**
   * Body of the response as a Blob.
   * @type {Blob | null}
   */
  body: Blob | null = null;

  /**
   * Body of the response as a readable stream.
   * @type {Readable | null}
   */
  bodyStream: Readable | null = null;

  /**
   * File path of the response.
   * @type {string | null}
   */
  file: string | null = null;

  /**
   * Creates an instance of ApiResponse.
   */
  constructor() {
    this.setHeader("Content-Type", "text/plain");
    this.setHeader("Server", "HomeCloud API Server");
    if (envConfig.IS_DEV) {
      const origin = envConfig.BASE_URL.substring(
        0,
        envConfig.BASE_URL.length - 1,
      );
      this.setAccessControl(origin);
    }
  }

  /**
   * Sets the Access-Control headers for the response.
   * @param {string} origin - The origin to set for the Access-Control-Allow-Origin header.
   */
  setAccessControl(origin: string) {
    this.setHeader("Access-Control-Allow-Origin", origin);
    this.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    );
    this.setHeader(
      "Access-Control-Allow-Headers",
      `Origin, Content-Type, ${WEB_TOKEN_HEADER_CAP}`,
    );
    this.setHeader("Access-Control-Allow-Credentials", "true");
    this.setHeader("Access-Control-Expose-Headers", WEB_TOKEN_HEADER_CAP);
  }

  /**
   * Sets a header for the response.
   * @param {string} name - The name of the header.
   * @param {string} value - The value of the header.
   */
  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  getContentType() {
    return this.headers["Content-Type"];
  }

  isJson() {
    return this.getContentType()?.includes("application/json");
  }

  async getBody(): Promise<Blob> {
    if (this.bodyStream) {
      const buffer = await streamToBuffer(this.bodyStream);
      return new Blob([buffer]);
    } else if (this.body) {
      return this.body;
    } else if (this.file) {
      const buffer = await fs.readFile(this.file);
      return new Blob([buffer]);
    }
  }

  status(status: number) {
    this.statusCode = status;
  }
  setBody(body: Blob, contentType: string) {
    this.body = body;
    this.setHeader("Content-Type", contentType);
  }
  json(body: any) {
    this.setBody(new Blob([JSON.stringify(body)]), "application/json");
  }
  text(body: string) {
    this.setBody(new Blob([body]), "text/plain");
  }
  html(html: string) {
    this.setBody(new Blob([html]), "text/html");
  }
  sendFile(filePath: string) {
    this.file = filePath;
    this.setHeader(
      "Content-Type",
      mime.getType(filePath) || "application/octet-stream",
    );
  }
  markAsDownload(filename: string) {
    this.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  }
  sendFileAsDownload(filePath: string, filename: string) {
    this.sendFile(filePath);
    this.markAsDownload(filename);
  }
  stream(bodyStream: Readable, contentType: string) {
    this.bodyStream = bodyStream;
    this.setHeader("Content-Type", contentType);
  }
  redirect(url: string) {
    this.status(301);
    this.setHeader("Location", url);
  }
  setCookie(key: string, value: string, ttl: number = 30 * 24 * 60 * 60) {
    const cookieStr = cookie.serialize(key, value, {
      maxAge: ttl,
      path: "/",
      sameSite: 'none',
      secure: true,
      partitioned: true,
    });
    this.setHeader(
      "Set-Cookie", cookieStr);
  }
  setWebToken(jwt: string) {
    this.setHeader(WEB_TOKEN_HEADER_CAP, jwt);
  }

  static error(statusCode: number, errorResponse: ErrorResponse) {
    const response = new ApiResponse();
    response.status(statusCode);
    response.json({
      error: errorResponse,
    });
    return response;
  }

  static fromError(error: Error, statusCode: number = 400) {
    let data: ErrorResponse = {
      type: ErrorType.Generic,
      message: error.message,
    };
    if (error instanceof CustomError) {
      data = { ...data, ...error.data };
      data.type = error.type;
    }
    if (statusCode === 500) {
      data.message = `Internal Server Error: ${error.message}`;
    }
    if (envConfig.IS_DEV) {
      data.debug = error.stack?.split("\n");
    }
    return ApiResponse.error(statusCode, data);
  }

  static json(statusCode: number, body: any) {
    const response = new ApiResponse();
    response.status(statusCode);
    response.json(body);
    return response;
  }

  static redirect(url: string) {
    const response = new ApiResponse();
    response.redirect(url);
    return response;
  }

  static stream(
    statusCode: number,
    bodyStream: Readable,
    contentType: string,
  ) {
    const response = new ApiResponse();
    response.status(statusCode);
    response.stream(bodyStream, contentType);
    return response;
  }
}

export type RouteHandler = (request: ApiRequest) => Promise<ApiResponse>;

export type ApiDecoratorHandler = (handler: RouteHandler) => RouteHandler;

export type ApiDecorator = (args: any[] | any) => ApiDecoratorHandler;

export class RouteGroup {
  queue: { pattern: string; handler: RouteHandler }[] = [];
  constructor() { }
  add(
    pattern: string,
    arg1: RouteHandler | ApiDecoratorHandler[],
    arg2?: RouteHandler,
  ) {
    let handler: RouteHandler;
    if (!!arg2) {
      handler = arg2;
      const decorators = arg1 as ApiDecoratorHandler[];
      decorators.reverse();
      for (const decorator of decorators) {
        handler = decorator(handler);
      }
    } else {
      handler = arg1 as RouteHandler;
    }
    this.queue.push({ pattern, handler });
  }
  handle = async (request: ApiRequest): Promise<ApiResponse> => {
    if (request.method === "OPTIONS") {
      return ApiResponse.json(204, {});
    }
    const route = this.queue.find((route) => {
      let pattern = request.matchedPattern + route.pattern;
      if (!pattern.endsWith("/") && !pattern.endsWith("/*")) {
        pattern += "/*";
      }
      const matchResult = match(pattern, request.path + "/");
      // console.log('matchResult', matchResult.matches, 'request.path', request.path, 'route.pattern', pattern);
      if (matchResult.matches) {
        if (matchResult.params) {
          request.urlParams = { ...request.urlParams, ...matchResult.params };
        }
        request.matchedPattern = request.matchedPattern + route.pattern;
        return true;
      }
      return false;
    });
    if (!!route) {
      try {
        return await route.handler(request);
      } catch (e: any) {
        console.error("❗️ [API] Internal Server Error", "URL:", request.url, e);
        return Promise.resolve(ApiResponse.fromError(e, 500));
      }
    }
    envConfig.IS_DEV && console.log("No match found for " + request.path, "queue:", this.queue);
    const response404 = new ApiResponse();
    response404.status(404);
    response404.text("Not found: " + request.path);
    return Promise.resolve(response404);
  };
}
