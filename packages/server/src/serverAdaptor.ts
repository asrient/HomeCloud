import http from "http";
import { envConfig } from "@homecloud/js-core/envConfig";
import { ApiRequest, ApiRequestFile } from "@homecloud/js-core/interface";
import path from "path";
import fs from "fs";
import busboy from "busboy";
import apiRouter from "@homecloud/js-core/apiRouter";
import mime from "mime";

export default class ServerAdaptor {
  getUrl(req: http.IncomingMessage) {
    if (!req.url) return null;
    if (req.url.endsWith("/") && req.url.length > 1) {
      req.url = req.url.substring(0, req.url.length - 1);
    }
    return new URL(req.url!, `http://${req.headers.host}`);
  }

  async handleStatic(
    url: URL,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
    let pathname = url.pathname;
    if (pathname === "/") {
      pathname = "/index";
    }
    let filePath = path.join(envConfig.WEB_BUILD_DIR, pathname);

    const ext = path.extname(filePath);
    if (!ext) {
      filePath = `${filePath}.html`;
    }

    fs.stat(filePath, (err, stats) => {
      let status = 200;

      if (err || !stats.isFile()) {
        status = 404;
        filePath = path.join(envConfig.WEB_BUILD_DIR, "404.html");
      }

      res.writeHead(status, {
        "Content-Type": mime.getType(filePath) || "application/octet-stream",
      });

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on("end", () => {
        res.end();
      });
      fileStream.on("error", (err) => {
        console.error("[handleStatic] fileStream error:", err);
        res.end();
      });
    });
  }

  async handleApi(
    url: URL,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
    const headers: { [key: string]: string } = {};
    if (!!req.headers) {
      Object.keys(req.headers).forEach((key) => {
        let val = req.headers[key];
        if (!val) return;
        if (typeof val !== "string") {
          console.log("[handleApi] request header is an array:", key, val);
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

    const apiRequest = new ApiRequest(
      req.method!,
      url,
      headers,
      getBody,
      fetchMultipartForm,
    );
    const apiResponse = await apiRouter.handle(apiRequest);

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

    if (envConfig.IS_DEV) {
      const date = new Date().toUTCString();
      console.log(`${date}: [${req.method}] ${url.pathname}`);
    }

    try {
      if (url.pathname.startsWith("/api/")) {
        await this.handleApi(url, req, res);
      } else {
        await this.handleStatic(url, req, res);
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
