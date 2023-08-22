import { app, BrowserWindow, protocol, net } from 'electron';
import { stat } from 'fs';
import path from 'path';

export default class AppProtocol {
    static PROTOCOL_NAME = 'app';
    static START_URL = AppProtocol.PROTOCOL_NAME + '://bundle/';
    static API_BASE_URL = AppProtocol.PROTOCOL_NAME + '://api/';
    static BUNDLE_BASE_URL = AppProtocol.PROTOCOL_NAME + '://bundle/';

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

    handleApi = (request: Request): Promise<Response> => {
        return new Promise<Response>((resolve, reject) => {
            const url = request.url;
            resolve(new Response('Hello APIs! url:' + url));
        });
    }

    register() {
        // Customize protocol to handle bundle resources and api.
        protocol.handle(AppProtocol.PROTOCOL_NAME, (request) => {
            if (request.url.startsWith(AppProtocol.BUNDLE_BASE_URL)) {
                return this.handleBundle(request);
            }
            if (request.url.startsWith(AppProtocol.API_BASE_URL)) {
                return this.handleApi(request);
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
