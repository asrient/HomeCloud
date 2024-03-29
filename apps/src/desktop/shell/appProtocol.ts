import { app, protocol, net } from "electron";
import { stat } from "fs";
import path from "path";
import { ApiRequest } from "../../backend/interface";
import apiRouter from "../../backend/apiRouter";
import { envConfig } from "../../backend/envConfig";

export default class AppProtocol {
  static PROTOCOL_NAME = "homecloud";
  static API_BASE_URL = AppProtocol.PROTOCOL_NAME + "://host/api/";
  static BUNDLE_BASE_URL = AppProtocol.PROTOCOL_NAME + "://host/";

  indexHtmlPath: string;
  html404Path: string;
  constructor() {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: AppProtocol.PROTOCOL_NAME,
        privileges: {
          bypassCSP: true,
          standard: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
          secure: true,
        },
      },
    ]);
    this.indexHtmlPath = path.join(envConfig.WEB_BUILD_DIR, "index.html");
    this.html404Path = path.join(envConfig.WEB_BUILD_DIR, "404.html");
  }

  handleBundle = (request: Request): Promise<Response> => {
    let fileRelativeUrl = request.url.replace(AppProtocol.BUNDLE_BASE_URL, "");
    if (fileRelativeUrl === "") {
      fileRelativeUrl = "/index.html";
    }
    if (fileRelativeUrl.endsWith("/")) {
      fileRelativeUrl = fileRelativeUrl.substring(
        0,
        fileRelativeUrl.length - 1,
      );
    }
    const ext = path.extname(fileRelativeUrl);
    if (!ext) {
      fileRelativeUrl = `${fileRelativeUrl}.html`;
    }
    let filePath = path.join(envConfig.WEB_BUILD_DIR, fileRelativeUrl);
    return new Promise<Response>((resolve, reject) => {
      stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          filePath = this.html404Path;
        }
        net
          .fetch("file://" + filePath)
          .then(resolve)
          .catch(reject);
      });
    });
  };

  handleApi = async (request: Request): Promise<Response> => {
    const url = request.url;
    const headers: { [key: string]: string } = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const getBody = async () =>
      !!request.blob && Buffer.from(await (await request.blob()).arrayBuffer());
    const apiRequest = new ApiRequest(request.method, url, headers, getBody);

    const apiResponse = await apiRouter.handle(apiRequest);
    if (!!apiResponse.file) {
      return net.fetch("file://" + apiResponse.file);
    }
    let responseBody: BodyInit | null | undefined = apiResponse.body;
    if (!!apiResponse.bodyStream) {
      responseBody = new ReadableStream({
        start(controller) {
          apiResponse.bodyStream!.on("data", (chunk) => {
            controller.enqueue(chunk);
          });
          apiResponse.bodyStream!.on("end", () => {
            controller.close();
          });
          apiResponse.bodyStream!.on("error", (err) => {
            controller.error(err);
          });
        },
      });
    }
    const response = new Response(responseBody, {
      status: apiResponse.statusCode,
      headers: apiResponse.headers,
    });
    return response;
  };

  registerExternalProtocol() {
    app.setAsDefaultProtocolClient(AppProtocol.PROTOCOL_NAME);
    if (!app.isDefaultProtocolClient(AppProtocol.PROTOCOL_NAME)) {
      console.error("Failed to register homecloud protocol");
    }
  };

  register() {
    // Customize protocol to handle bundle resources and api.
    protocol.handle(AppProtocol.PROTOCOL_NAME, (request) => {

      if (request.url.startsWith(AppProtocol.API_BASE_URL)) {
        return this.handleApi(request);
      }
      if (request.url.startsWith(AppProtocol.BUNDLE_BASE_URL)) {
        return this.handleBundle(request);
      }
      return new Promise<Response>((resolve, _) => {
        resolve(
          new Response(null, {
            status: 301,
            headers: {
              Location: envConfig.BASE_URL,
            },
          }),
        );
      });
    });
    this.registerExternalProtocol();
  }
}
