import http from "http";
import tls from "tls";
import { envConfig } from "./envConfig";
import { ApiRequest, ApiRequestFile, RouteGroup } from "./interface";
import { RequestOriginType } from "./envConfig";
import fs from "fs";
import busboy from "busboy";

export default class ServerAdaptor {
  router: RouteGroup;
  requestType: RequestOriginType;

  constructor(router: RouteGroup, requestOrigin: RequestOriginType) {
    this.router = router;
    this.requestType = requestOrigin;
  }

  getUrl(req: http.IncomingMessage) {
    if (!req.url) return null;
    if (req.url.endsWith("/") && req.url.length > 1) {
      req.url = req.url.substring(0, req.url.length - 1);
    }
    return new URL(req.url!, `http://${req.headers.host}`);
  }

  async handleAPI(
    url: URL,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
    const headers: { [key: string]: string } = {};
    const secureSocket: tls.TLSSocket | null = req.socket instanceof tls.TLSSocket ? req.socket : null;
    const cert = secureSocket?.getPeerCertificate();

    // Make sure agent requests have a client cert
    if (this.requestType === RequestOriginType.Agent) {
      if (!cert) {
        console.error("[ServerAdaptor] Agent request without client cert");
        res.writeHead(401);
        res.end();
        return;
      }
      if (!cert.raw) {
        console.error("[ServerAdaptor] Agent request with empty client cert");
        res.writeHead(401);
        res.end();
        return;
      }
    }

    // Validate client cert date
    if (cert) {
      if (cert.valid_to && new Date(cert.valid_to) < new Date()) {
        console.error("[ServerAdaptor] Client cert expired");
        res.writeHead(401);
        res.end();
        return;
      }
    }

    if (!!req.headers) {
      Object.keys(req.headers).forEach((key) => {
        let val = req.headers[key];
        if (!val) return;
        if (typeof val !== "string") {
          console.log("[ServerAdaptor] request header is an array:", key, val);
          val = val.toString();
        }
        headers[key] = val;
      });
    }

    const fetchMultipartForm = async (
      cb: (type: "file" | "field", file: ApiRequestFile | any) => Promise<void>,
    ) => {
      const bb = busboy({ headers: req.headers });
      return new Promise<void>((resolve, reject) => {
        const promises: Promise<void>[] = [];
        bb.on("file", (name, file, info) => {
          const stream = file as fs.ReadStream;
          promises.push(
            cb("file", {
              name: info.filename,
              mime: info.mimeType,
              stream: stream,
            } as ApiRequestFile),
          );
        });
        bb.on("field", (name, val) => {
          promises.push(
            cb("field", {
              name: name,
              value: val,
            }),
          );
        });
        bb.on("finish", () => {
          Promise.all(promises)
            .then(() => {
              resolve();
            })
            .catch((err) => {
              console.error("fetchMultipartForm error:", err);
              reject(err);
            });
        });
        bb.on("error", (err) => {
          console.error("busboy error:", err);
          reject(err);
        });
        req.pipe(bb);
      });
    };

    const getBody = async () => {
      return new Promise<Buffer>((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        req.on("data", (chunk: Uint8Array) => {
          chunks.push(chunk);
        });
        req.on("end", () => {
          resolve(Buffer.concat(chunks));
        });
        req.on("error", (err) => {
          reject(err);
        });
      });
    };

    const clientPublicKey = () => {
      return cert?.pubkey.toString("base64");
    }

    const remoteAddress = req.socket.remoteAddress || null;

    const apiRequest = new ApiRequest(
      req.method!,
      url,
      headers,
      getBody,
      fetchMultipartForm,
      req,
      this.requestType,
      clientPublicKey,
      remoteAddress,
    );
    const apiResponse = await this.router.handle(apiRequest);

    res.writeHead(apiResponse.statusCode, apiResponse.headers);
    if (!!apiResponse.file) {
      const fileStream = fs.createReadStream(apiResponse.file);
      fileStream.pipe(res);

      fileStream.on("end", () => {
        res.end();
      });
      fileStream.on("error", (err) => {
        console.error("fileStream error:", err);
        res.end();
      });
    } else if (!!apiResponse.bodyStream) {
      apiResponse.bodyStream.pipe(res);
      apiResponse.bodyStream.on("end", () => {
        res.end();
      });
      apiResponse.bodyStream.on("error", (err) => {
        console.error("bodyStream error:", err);
        res.end();
      });
    } else {
      res.write(
        Buffer.from(
          (await apiResponse.body?.arrayBuffer()) || new ArrayBuffer(0),
        ),
      );
      res.end();
    }
  }

  nativeHandler = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => {
    if (!req.url || !req.method) {
      res.end();
      return;
    }
    const url = this.getUrl(req)!;

    const date = new Date().toUTCString();
    console.log(`${date}: [${req.method}] ${url.pathname}`);

    try {
      if (url.pathname.startsWith("/api/")) {
        await this.handleAPI(url, req, res);
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch (err: any) {
      console.error("❗️ Internal Server Error:", err);
      res.writeHead(500);
      res.write("<h2>Internal Server Error</h2>");
      if (envConfig.IS_DEV) {
        res.write(err.message);
        res.write("<h4>Stack:</h4>" + err.stack);
      }
      res.end();
    }
  };
}
