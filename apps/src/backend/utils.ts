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

// sample util, remove later
export const add = (a: number, b: number) => a + b;
