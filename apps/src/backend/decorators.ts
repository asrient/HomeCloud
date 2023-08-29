import { ApiResponse } from "./interface";
import { makeDecorator } from "./utils";
import isType from 'type-is';
import Ajv from "ajv";
import { verifyJwt } from "./utils/profileUtils";
import { Profile } from "./models";

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
        try{
            data = await request.json();
        }
        catch(e: any) {
            return ApiResponse.error(400, 'Could not parse json body');
        }
        if (!validator(data)) {
            return ApiResponse.error(400, 'Invalid request body json', parseJsonValidatorErrors(validator.errors));
        }
        request.validatedJson = data;
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
