import { ApiRequest, ApiResponse, RouteGroup } from "../interface";

const api = new RouteGroup();

api.add('/', async (request: ApiRequest) => {
    const response = new ApiResponse();
    response.setStatus(200);
    response.json({ message: 'Info root /', url: request.url, urlParams: request.urlParams });
    return response;
});

api.add('/hello/', async (request: ApiRequest) => {
    const response = new ApiResponse();
    response.setStatus(200);
    response.json({ message: 'Hello World!', url: request.url, urlParams: request.urlParams });
    return response;
});

api.add('/hello/*', async (request: ApiRequest) => {
    const response = new ApiResponse();
    response.setStatus(200);
    response.json({ message: 'Hello World *', url: request.url, urlParams: request.urlParams });
    return response;
});

export default api;
