import { ApiResponse } from "./interface";
import { makeDecorator } from "./utils";
import isType from 'type-is';

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
        if (!request.body || !isType.is(request.contentType, args)) {
            return ApiResponse.error('Request body is null or content type is not accepted');
        }
        return next();
    });
}
