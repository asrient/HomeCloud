import { app, protocol, net } from 'electron';
import { stat } from 'fs';
import path from 'path';
import { ApiRequest } from '../../backend/interface';
import apiRouter from '../../backend/apiRouter';

export default class AppProtocol {
    static PROTOCOL_NAME = 'app';
    static START_URL = AppProtocol.PROTOCOL_NAME + '://host/';
    static API_BASE_URL = AppProtocol.PROTOCOL_NAME + '://host/api/';
    static BUNDLE_BASE_URL = AppProtocol.PROTOCOL_NAME + '://host/';

    appPath: string;
    indexHtmlPath: string;
    constructor() {
        protocol.registerSchemesAsPrivileged([{
            scheme: AppProtocol.PROTOCOL_NAME,
            privileges: {
                bypassCSP: true,
                standard: true,
                supportFetchAPI: true,
                corsEnabled: true,
                stream: true
            }
        }
        ]);
        this.appPath = app.getAppPath();
        this.indexHtmlPath = path.join(this.appPath, 'bin/web/index.html');
    }

    handleBundle = (request: Request): Promise<Response> => {
        let fileRelativeUrl = request.url.replace(AppProtocol.BUNDLE_BASE_URL, '');
        if (fileRelativeUrl === '') {
            fileRelativeUrl = '/index.html';
        }
        if (fileRelativeUrl.endsWith('/')) {
            fileRelativeUrl = fileRelativeUrl.substring(0, fileRelativeUrl.length - 1);
        }
        let filePath = path.join(this.appPath, 'bin/web', fileRelativeUrl);
        return new Promise<Response>((resolve, reject) => {
            stat(filePath, (err, stats) => {
                if (err || !stats.isFile()) {
                    filePath = this.indexHtmlPath;
                }
                net.fetch('file://' + filePath).then(resolve).catch(reject);
            });
        });
    }

    handleApi = async (request: Request): Promise<Response> => {
        const url = request.url;
        const headers: { [key: string]: string; } = {};
        request.headers.forEach((value, key) => {
            headers[key] = value;
        });
        const getBody = async () => !!request.blob && Buffer.from(await (await request.blob()).arrayBuffer());
        const apiRequest = new ApiRequest(request.method, url, headers, getBody);

        const apiResponse = await apiRouter.handle(apiRequest);
        if(!!apiResponse.file) {
            return net.fetch('file://' + apiResponse.file);
        }
        const response = new Response(apiResponse.body, {
            status: apiResponse.statusCode,
            headers: apiResponse.headers
        });
        return response;
    }

    register() {
        // Customize protocol to handle bundle resources and api.
        protocol.handle(AppProtocol.PROTOCOL_NAME, (request) => {
            if (request.url.startsWith(AppProtocol.API_BASE_URL)) {
                return this.handleApi(request);
            }
            if (request.url.startsWith(AppProtocol.BUNDLE_BASE_URL)) {
                return this.handleBundle(request);
            }
            return new Promise<Response>((resolve, _) => {
                resolve(new Response(null, {
                    status: 301,
                    headers: {
                        Location: AppProtocol.START_URL
                    }
                }));
            });
        });
    }
}