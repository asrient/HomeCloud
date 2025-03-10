import {
  ApiRequest,
  ApiResponse,
  RouteGroup,
  ApiRequestFile,
} from "../interface";
import {
  method,
  validateJson,
  authenticate,
  fetchStorage,
  fetchFsDriver,
  validateQuery,
} from "../decorators";
import { envConfig } from "../envConfig";
import { FsDriver, RemoteItem } from "../storageKit/interface";
import mime from "mime";
import fs from "fs";
import CustomError from "../customError";
import { bufferToStream } from "../utils";

const api = new RouteGroup();

const commonOptions = {
  storageId: { type: "number" },
};

const readDirSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    ...commonOptions,
  },
  required: ["id"],
};

api.add(
  "/readDir",
  [
    method(["POST"]),
    authenticate(),
    validateJson(readDirSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const pathId = request.local.json.id;
    try {
      const contents = await fsDriver.readDir(pathId);
      return ApiResponse.json(200, contents);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not read dir: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const mkDirSchema = {
  type: "object",
  properties: {
    parentId: { type: "string" },
    name: { type: "string" },
    ...commonOptions,
  },
  required: ["parentId", "name"],
};

api.add(
  "/mkDir",
  [
    method(["POST"]),
    authenticate(),
    validateJson(mkDirSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const parentId = request.local.json.parentId;
    const name = request.local.json.name;
    try {
      const item = await fsDriver.mkDir(name, parentId);
      return ApiResponse.json(201, item);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not create dir: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const unlinkSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    ...commonOptions,
  },
  required: ["id"],
};

api.add(
  "/unlink",
  [
    method(["POST"]),
    authenticate(),
    validateJson(unlinkSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const id = request.local.json.id;
    try {
      await fsDriver.unlink(id);
      return ApiResponse.json(200, {
        deleted: true,
      });
    } catch (e: any) {
      console.error(e);
      e.message = `Could not delete item: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const unlinkMultipleSchema = {
  type: "object",
  properties: {
    ids: {
      type: "array",
      items: { type: "string" },
    },
    ...commonOptions,
  },
  required: ["ids"],
};

api.add(
  "/unlinkMultiple",
  [
    method(["POST"]),
    authenticate(),
    validateJson(unlinkMultipleSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const ids = request.local.json.ids;
    try {
      const deletedIds = await fsDriver.unlinkMultiple(ids);
      return ApiResponse.json(200, {
        deletedIds,
      });
    } catch (e: any) {
      console.error(e);
      e.message = `Could not delete items: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const renameSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    newName: { type: "string" },
    ...commonOptions,
  },
  required: ["id", "newName"],
};

api.add(
  "/rename",
  [
    method(["POST"]),
    authenticate(),
    validateJson(renameSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const id = request.local.json.id;
    const newName = request.local.json.newName;
    try {
      const item = await fsDriver.rename(id, newName);
      return ApiResponse.json(200, item);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not rename item: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const readFileSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    storageId: { type: "string" },
    download: { type: "string", enum: ["1", "0"] },
  },
  required: ["id"],
};

api.add(
  "/readFile",
  [
    method(["GET"]),
    authenticate(),
    validateQuery(readFileSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const id = request.getParams.id;
    const isDownload = request.getParams.download === "1";
    try {
      const [stream, mime] = await fsDriver.readFile(id);
      const resp = ApiResponse.stream(
        200,
        stream,
        mime || "application/octet-stream",
      );
      if (isDownload) {
        const stat = await fsDriver.getStat(id);
        resp.markAsDownload(stat.name);
      }
      return resp;
    } catch (e: any) {
      console.error(e);
      e.message = `Could not read file: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const writeTextFileSchema = {
  type: "object",
  properties: {
    parentId: { type: "string" },
    fileName: { type: "string" },
    content: { type: "string" },
    mimeType: { type: "string" },
    ...commonOptions,
  },
  required: ["parentId", "fileName", "content", "mimeType"],
};

api.add(
  "/writeTextFile",
  [method(["POST"]),
  authenticate(),
  validateJson(writeTextFileSchema),
  fetchStorage(),
  fetchFsDriver()],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const parentId = request.local.json.parentId;
    const { fileName, content, mimeType } = request.local.json;
    const contentBuffer = Buffer.from(content);
    const contentStream = bufferToStream(contentBuffer);
    const apiRequestFile: ApiRequestFile = {
      name: fileName,
      mime: mimeType,
      stream: contentStream,
    };
    try {
      const item = await fsDriver.writeFile(parentId, apiRequestFile);
      return ApiResponse.json(200, item);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not write text file: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  }
);

const updateTextFileSchema = {
  type: "object",
  properties: {
    fileId: { type: "string" },
    content: { type: "string" },
    mimeType: { type: "string" },
    ...commonOptions,
  },
  required: ["fileId", "content", "mimeType"],
};

api.add(
  "/updateTextFile",
  [method(["POST"]),
  authenticate(),
  validateJson(updateTextFileSchema),
  fetchStorage(),
  fetchFsDriver()],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const { content, fileId, mimeType } = request.local.json;
    const contentBuffer = Buffer.from(content);
    const contentStream = bufferToStream(contentBuffer);
    const apiRequestFile: ApiRequestFile = {
      name: fileId,
      mime: mimeType,
      stream: contentStream,
    };
    try {
      const item = await fsDriver.updateFile(fileId, apiRequestFile);
      return ApiResponse.json(200, item);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not update text file: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  }
);

api.add(
  "/writeFiles/",
  [method(["POST"]), authenticate(), fetchStorage(), fetchFsDriver()],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;

    let parentId: string | null = null;
    const items: RemoteItem[] = [];

    const processFile = async (file: ApiRequestFile) => {
      const stream = file.stream;
      if (!parentId) {
        console.error("got file before parentId");
        stream.resume();
        return;
      }
      try {
        const item = await fsDriver.writeFile(parentId, file);
        items.push(item);
      } catch (e: any) {
        console.error(e);
        return;
      }
    };

    if (request.mayContainFiles && request.fetchMultipartForm) {
      await request.fetchMultipartForm(async (type, data) => {
        if (type === "field") {
          if (data.name === "parentId") {
            parentId = data.value;
          }
        } else if (type === "file") {
          await processFile(data as ApiRequestFile);
        }
      });
      return ApiResponse.json(201, items);
    } else {
      return ApiResponse.fromError(
        CustomError.validationSingle("files", "No files found"),
      );
    }
  },
);

const writeFilesSchema = {
  type: "object",
  properties: {
    parentId: { type: "string" },
    filePaths: {
      type: "array",
      items: {
        type: "string",
      },
    },
    ...commonOptions,
  },
  required: ["parentId", "filePaths"],
};

api.add(
  "/writeFiles/desktop",
  [
    method(["POST"]),
    authenticate(),
    validateJson(writeFilesSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;

    const parentId = request.local.json.parentId;
    const filePaths = request.local.json.filePaths as string[];

    const fileItems: ApiRequestFile[] = filePaths.map((p) => {
      const stream = fs.createReadStream(p);
      return {
        name: p.split("/").pop()!,
        mime: mime.getType(p) || "application/octet-stream",
        stream,
      } as ApiRequestFile;
    });

    try {
      const items = await fsDriver.writeFiles(parentId, fileItems);
      return ApiResponse.json(201, items);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not write files: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

api.add(
  "/updateFile",
  [method(["POST"]), authenticate(), fetchStorage(), fetchFsDriver()],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;

    let id: string | null = null;
    let item: RemoteItem | null = null;
    let fileReceived = false;

    const processFile = async (file: ApiRequestFile) => {
      const stream = file.stream;
      if (!id || fileReceived) {
        console.error("got file before id or multiple files");
        stream.resume();
        return;
      }
      fileReceived = true;
      item = await fsDriver.updateFile(id, file);
    };

    if (request.mayContainFiles && request.fetchMultipartForm) {
      await request.fetchMultipartForm(async (type, data) => {
        if (type === "field") {
          if (data.name === "id") {
            id = data.value;
          }
        } else if (type === "file") {
          await processFile(data as ApiRequestFile);
        }
      });
      return ApiResponse.json(201, item);
    } else {
      return ApiResponse.fromError(
        CustomError.validationSingle("files", "No files found"),
      );
    }
  },
);

const moveSchema = {
  type: "object",
  properties: {
    fileId: { type: "string" },
    destParentId: { type: "string" },
    newFileName: { type: "string" },
    deleteSource: { type: "boolean", default: false },
    ...commonOptions,
  },
  required: ["fileId", "destParentId", "newFileName"],
};

api.add(
  "/moveFile",
  [
    method(["POST"]),
    authenticate(),
    validateJson(moveSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const { fileId, destParentId, newFileName, deleteSource } =
      request.local.json;
    try {
      const item = await fsDriver.moveFile(
        fileId,
        destParentId,
        newFileName,
        deleteSource,
      );
      return ApiResponse.json(200, item);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not move file: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const moveDirSchema = {
  type: "object",
  properties: {
    dirId: { type: "string" },
    destParentId: { type: "string" },
    newDirName: { type: "string" },
    deleteSource: { type: "boolean", default: false },
    ...commonOptions,
  },
  required: ["dirId", "destParentId", "newDirName"],
};

api.add(
  "/moveDir",
  [
    method(["POST"]),
    authenticate(),
    validateJson(moveDirSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const { dirId, destParentId, newDirName, deleteSource } =
      request.local.json;
    try {
      const item = await fsDriver.moveDir(
        dirId,
        destParentId,
        newDirName,
        deleteSource,
      );
      return ApiResponse.json(200, item);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not move dir: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const getStatSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    ...commonOptions,
  },
  required: ["id"],
};

api.add(
  "/getStat",
  [
    method(["POST"]),
    authenticate(),
    validateJson(getStatSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const id = request.local.json.id;
    try {
      const item = await fsDriver.getStat(id);
      return ApiResponse.json(200, item);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not get item stat: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const getStatsSchema = {
  type: "object",
  properties: {
    ids: {
      type: "array",
      items: { type: "string" },
    },
    ...commonOptions,
  },
  required: ["ids"],
};

api.add(
  "/getStats",
  [
    method(["POST"]),
    authenticate(),
    validateJson(getStatsSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    const ids = request.local.json.ids;
    try {
      const items = await fsDriver.getStats(ids);
      return ApiResponse.json(200, items);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not get items stats: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

const getStatByFilenameSchema = {
  type: "object",
  properties: {
    parentId: { type: "string" },
    name: { type: "string" },
    ...commonOptions,
  },
  required: ["name"],
};

api.add(
  "/getStatByFilename",
  [
    method(["POST"]),
    authenticate(),
    validateJson(getStatByFilenameSchema),
    fetchStorage(),
    fetchFsDriver(),
  ],
  async (request: ApiRequest) => {
    const fsDriver = request.local.fsDriver as FsDriver;
    let { parentId, name } = request.local.json;
    if (!parentId || parentId === "/" || parentId === "") {
      parentId = null;
    }
    try {
      const stats = await fsDriver.getStatByFilename(name, parentId);
      return ApiResponse.json(200, stats);
    } catch (e: any) {
      console.error(e);
      e.message = `Could not get item stat by filename: ${e.message}`;
      return ApiResponse.fromError(e);
    }
  },
);

export default api;
