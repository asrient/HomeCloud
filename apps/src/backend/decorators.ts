import { ApiResponse } from "./interface";
import { makeDecorator } from "./utils";
import isType from 'type-is';
import Ajv, { ErrorObject } from "ajv";
import { verifyJwt } from "./utils/profileUtils";
import { Profile, Storage } from "./models";
import { getFsDriver } from "./storageKit/storageHelper";
import PhotosService from "./services/photos/photosService";
import { FsDriver } from "./storageKit/interface";
import CustomError, { ErrorCode } from "./customError";

const ajv = new Ajv();

export function method(args: any[]) {
    return makeDecorator(async (request, next) => {
        if (request.method === 'OPTIONS') {
            return ApiResponse.json(204, {});
        }
        if (!args.includes(request.method)) {
            return ApiResponse.fromError(CustomError.security('Method not allowed'), 405);
        }
        return next();
    });
}

export function accept(args: any[]) {
    return makeDecorator(async (request, next) => {
        if (!isType.is(request.contentType, args)) {
            return ApiResponse.fromError(CustomError.security(
                `Content type is not accepted. Allowed: ${args.join(', ')}. Received: ${request.contentType}`
            ), 406);
        }
        return next();
    });
}

function parseJsonValidatorErrors(errors: ErrorObject[]) {
    const errorsMap: { [key: string]: string[] } = {};
    errors.forEach((err: ErrorObject) => {
        const prop = err.propertyName || 'root';
        if (!errorsMap[prop]) {
            errorsMap[prop] = [];
        }
        errorsMap[prop].push(err.message || 'Invalid value');
    });
    return CustomError.validation(errorsMap);
}

export function validateJson(schema: any) {
    const validator = ajv.compile(schema);

    return makeDecorator(async (request, next) => {
        if (!request.isJson) {
            return ApiResponse.fromError(CustomError.generic('Content type is not json'), 406);
        }
        let data;
        try {
            data = await request.json();
        }
        catch (e: any) {
            return ApiResponse.fromError(CustomError.generic(`Could not parse json: ${e.message}`));
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

export function authenticate(authType: AuthType = AuthType.Required) {
    return makeDecorator(async (request, next) => {
        const profileId = verifyJwt(request.cookies.jwt);
        const profile = await Profile.getProfileById(profileId);
        if (!profile && authType === AuthType.Required) {
            return ApiResponse.fromError(CustomError.security('Authentication required'), 401);
        }
        request.profile = profile;
        return next();
    });
}

export enum AuthType {
    Required,
    Optional,
}

export function fetchStorage() {
    return makeDecorator(async (request, next) => {
        console.log('Fetch storage')
        let storageId = request.headers['x-storage-id'];
        if (!storageId && request.local.json && request.local.json.storageId) {
            storageId = request.local.json.storageId;
        }
        if (!storageId && request.getParams.storageId) {
            storageId = request.getParams.storageId;
        }
        if (!storageId) {
            return ApiResponse.fromError(CustomError.validationSingle('storageId', 'Storage id is required'));
        }
        const storage = await request.profile!.getStorageById(parseInt(storageId));
        if (!storage) {
            return ApiResponse.fromError(CustomError.validationSingle('storageId', 'Storage not found'));
        }
        request.local.storage = storage;
        return next();
    });
}

export function fetchFsDriver() {
    return makeDecorator(async (request, next) => {
        const storage = request.local.storage;
        try {
            const fsDriver = await getFsDriver(storage);
            request.local.fsDriver = fsDriver;
        } catch (e: any) {
            console.error(e);
            return ApiResponse.fromError(CustomError.code(ErrorCode.FS_DRIVER_FETCH, `Fetch fs driver: ${e.message}`));
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
            return ApiResponse.fromError(CustomError.code(ErrorCode.STORAGE_FETCH, 'Storage meta not found for storage'));
        }
        request.local.photoService = new PhotosService(fsDriver, storageMeta);
        return next();
    });
}
