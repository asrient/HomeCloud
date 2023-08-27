import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import { method, accept } from "../decorators";
import { Profile } from "../models";

const api = new RouteGroup();

api.add('/createProfile', [
    method(['POST']),
    accept(['json']),
], async (request: ApiRequest) => {
    const data = await request.json();
    if(!data || !data.name || !data.userName) {
        return ApiResponse.error(400, 'Invalid request body', data);
    }
    let profile: Profile;
    try {
        profile = await Profile.createProfile(data.userName, data.name);
    }
    catch(e: any) {
        return ApiResponse.error(400, 'Could not create profile', {
            error: e.message,
            requestData: data,
        });
    }
    return ApiResponse.json(201, profile.getDetails());
});

api.add('/hello/', async (request: ApiRequest) => {
    const response = new ApiResponse();
    response.status(200);
    response.json({ message: 'Hello World!', url: request.url });
    return response;
});

api.add('/hello/*', async (request: ApiRequest) => {
    const response = new ApiResponse();
    response.status(200);
    response.json({ message: 'Hello World *', url: request.url, urlParams: request.urlParams });
    return response;
});

export default api;
