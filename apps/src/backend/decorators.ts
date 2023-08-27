import { ApiResponse } from "./interface";
import { makeDecorator } from "./utils";
import isType from 'type-is';
import Ajv from "ajv";

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

export function validateJson(schema: any) {
    const validator = ajv.compile(schema);

    return makeDecorator(async (request, next) => {
        if (!request.isJson) {
            return ApiResponse.error('Content type is not json.');
        }
        const data = await request.json();
        if(!validator(data)) {
            return ApiResponse.error(400, 'Invalid request body', validator.errors);
        }
        request.validatedJson = data;
        return next();
    });
}
