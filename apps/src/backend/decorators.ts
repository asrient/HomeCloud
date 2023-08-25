import { ApiResponse } from "./interface";
import { makeDecorator } from "./utils";

export function method(args: any[]) {
    return makeDecorator(async (request, next) => {
        if (!args.includes(request.method)) {
            const response = new ApiResponse();
            response.status(405);
            response.text('Method not allowed: ' + request.method);
            return response;
        }
        return next();
    });
}
