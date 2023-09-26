import { ApiResponse } from "./interface";
import { makeDecorator } from "./utils";
import isType from 'type-is';
import Ajv from "ajv";
import { verifyJwt } from "./utils/profileUtils";
import { Profile, Storage } from "./models";
import { getFsDriver } from "./storageKit/storageHelper";
import PhotosService from "./services/photos/photosService";
import { FsDriver } from "./storageKit/interface";

const ajv = new Ajv();

export function method(args: any[]) {
    return makeDecorator(async (request, next) => {
        if (!args.includes(request.method)) {
            return ApiResponse.error(405, 'Method not allowed: ' + request.method);
        }
        return next();
    });
}

export function accept(args: any[]) {
    return makeDecorator(async (request, next) => {
        if (!isType.is(request.contentType, args)) {
            return ApiResponse.error(`Content type is not accepted. Allowed: ${args.join(', ')}. Received: ${request.contentType}`);
        }
        return next();
    });
}

function parseJsonValidatorErrors(errors: any) {
    return errors.map((err: any) => {
        return err.message;
    });
}

export function validateJson(schema: any) {
    const validator = ajv.compile(schema);

    return makeDecorator(async (request, next) => {
        if (!request.isJson) {
            return ApiResponse.error('Content type is not json.');
        }
        let data;
        try {
            data = await request.json();
        }
        catch (e: any) {
            return ApiResponse.error(400, 'Could not parse json body');
        }
        if (!validator(data)) {
            return ApiResponse.error(400, 'Invalid request body json', parseJsonValidatorErrors(validator.errors));
        }
        request.local.json = data;
        return next();
    });
}

export function validateQuery(schema: any) {
    const validator = ajv.compile(schema);

    return makeDecorator(async (request, next) => {
        const data = request.getParams;
        if (!validator(data)) {
            return ApiResponse.error(400, 'Invalid query params', parseJsonValidatorErrors(validator.errors));
        }
        return next();
    });
}

export function authenticate(authType: AuthType = AuthType.Required) {
    return makeDecorator(async (request, next) => {
        const profileId = verifyJwt(request.cookies.jwt);
        const profile = await Profile.getProfileById(profileId);
        if (!profile && authType === AuthType.Required) {
            return ApiResponse.error(401, 'Not authenticated');
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
            return ApiResponse.error(400, 'Storage id not provided');
        }
        const storage = await request.profile!.getStorageById(parseInt(storageId));
        if (!storage) {
            return ApiResponse.error(404, 'Storage not found');
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
            return ApiResponse.error(400, 'Could not get fs driver', {
                error: e.message
            });
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
            return ApiResponse.error(400, 'Storage meta not found');
        }
        request.local.photoService = new PhotosService(fsDriver, storageMeta);
        return next();
    });
}
