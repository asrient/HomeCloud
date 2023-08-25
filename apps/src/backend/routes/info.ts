import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method } from "../decorators";

const api = new RouteGroup();

// sample api, remove later

let counter = 0;

api.add('/', [
    method(['POST'])
], async (request: ApiRequest) => {
    const response = new ApiResponse();
    response.status(200);
    counter++;
    response.json({ message: 'Info root /', url: request.url, counter });
    return response;
});

api.add('/hello/', async (request: ApiRequest) => {
    const response = new ApiResponse();
    response.status(200);
    counter++;
    response.json({ message: 'Hello World!', url: request.url, counter });
    return response;
});

api.add('/hello/*', async (request: ApiRequest) => {
    const response = new ApiResponse();
    response.status(200);
    response.json({ message: 'Hello World *', url: request.url, urlParams: request.urlParams });
    return response;
});

export default api;
