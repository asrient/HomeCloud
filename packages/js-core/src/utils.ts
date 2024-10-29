import crypto from "crypto";
import {
  ApiRequest,
  ApiResponse,
  ApiDecoratorHandler,
  RouteHandler,
} from "./interface";
import cloneable from "cloneable-readable";
import { Readable } from "stream";
import fs from "fs";
import { DeviceFormType, DeviceInfo, OSType } from "./envConfig";

export function makeDecorator(
  cb: (
    request: ApiRequest,
    next: () => Promise<ApiResponse>,
  ) => Promise<ApiResponse>,
): ApiDecoratorHandler {
  return (handler: RouteHandler) => {
    return (request: ApiRequest) => {
      const next = () => handler(request);
      return cb(request, next);
    };
  };
}

export function joinUrlPath(base: string, path: string) {
  if (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  if (path.startsWith("/")) {
    path = path.slice(1);
  }
  return `${base}/${path}`;
}

export function createHash(text: string) {
  return crypto.createHash("md5").update(text).digest("hex");
}

// sample util, remove later
export const add = (a: number, b: number) => a + b;

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export async function streamToString(stream: Readable): Promise<string> {
  const buffer = await streamToBuffer(stream);
  return buffer.toString("utf8");
}

export async function streamToJson(stream: Readable) {
  const str = await streamToString(stream);
  return JSON.parse(str);
}

export function cloneStream(stream: fs.ReadStream) {
  return cloneable(stream);
}

export function bufferToStream(buffer: Buffer): Readable {
  return Readable.from(buffer);
}

export function jsonToStream(json: any): Readable {
  return bufferToStream(Buffer.from(JSON.stringify(json)));
}
function normalizeDate(timestamp: number) {
  return Math.floor(timestamp / 1000) * 1000;
}
export function getToday() {
  return normalizeDate(Date.now());
}

export function getIconKey(deviceInfo: DeviceInfo) {
  const { formFactor, os, osFlavour } = deviceInfo;
  if(formFactor === DeviceFormType.Server) {
    return "server";
  }
  switch (os) {
    case OSType.Windows:
      let win = formFactor === DeviceFormType.Desktop ? 'pc' : "laptop";
      if (osFlavour === '11') {
        return `${win}-win11`;
      } else if (osFlavour === '10' && formFactor === DeviceFormType.Desktop) {
        return `${win}-win10`;
      }
      return `${win}-win`;
    case OSType.MacOS:
      let mac = formFactor === DeviceFormType.Desktop ? 'mac' : "macbook";
      if (!osFlavour) return mac;
      const major = parseInt(osFlavour.split('.')[0]);
      if (major <= 10) {
        return `${mac}-10`;
      }
      if (major <= 15) {
        return `${mac}-${major}`;
      }
      return mac;
    case OSType.Linux:
    default:
      return formFactor === DeviceFormType.Desktop ? "pc" : "laptop";
  }
}
