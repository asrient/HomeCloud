import crypto from 'crypto'; 
import { ApiRequest, ApiResponse, ApiDecoratorHandler, RouteHandler } from "./interface";

export function makeDecorator(cb: (request: ApiRequest,
    next: (() => Promise<ApiResponse>)) => Promise<ApiResponse>): ApiDecoratorHandler {
    return (handler: RouteHandler) => {
        return (request: ApiRequest) => {
            const next = () => handler(request);
            return cb(request, next);
        };
    };
}

export function joinUrlPath(base: string, path: string) {
    if (base.endsWith('/')) {
        base = base.slice(0, -1);
    }
    if (path.startsWith('/')) {
        path = path.slice(1);
    }
    return `${base}/${path}`;
}

export function createHash(text: string) {
    return crypto.createHash('md5').update(text).digest('hex');
}

// sample util, remove later
export const add = (a: number, b: number) => a + b;
