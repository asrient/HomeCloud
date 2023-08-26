import qs, { ParsedQs } from 'qs';
import isType from 'type-is';
import cookie from 'cookie';
import mime from 'mime';
import { match } from 'node-match-path';
import { envConfig } from './envConfig';

export type ApiRequestFile = {
    name: string;
    mime: string;
    size: number;
    path: string;
}

export class ApiRequest {
    params: ParsedQs;
    url: URL;
    urlParams: { [key: string]: string | string[] | ParsedQs | ParsedQs[] | undefined } = {};
    matchedPattern: string = '/api';
    headers: { [key: string]: string };
    cookies: { [key: string]: string } = {};
    method: string;
    constructor(
        method: string,
        url: string | URL,
        headers: { [key: string]: string },
        public body: (() => Promise<Buffer>) | null = null,
        public downloadAttachedFiles: (() => Promise<ApiRequestFile[]>) | null = null,
    ) {
        this.method = method.toUpperCase();

        if (typeof url === 'string') {
            if (url.endsWith('/') && url.length > 1) {
                url = url.substring(0, url.length - 1);
            }
            this.url = new URL(url);
        } else {
            this.url = url;
        }

        this.params = qs.parse(this.url.search, { ignoreQueryPrefix: true });

        this.headers = {};
        for (const key in headers) {
            this.headers[key.toLowerCase()] = headers[key];
        }
        if (this.cookieString) {
            this.cookies = cookie.parse(this.cookieString);
        }
    }
    get mayContainFiles() {
        return this.method === 'POST' && this.headers['content-type']?.includes('multipart/form-data');
    }
    get path() {
        return this.url.pathname;
    }
    get queryString() {
        return this.url.search;
    }
    get hash() {
        return this.url.hash;
    }
    get origin() {
        return this.url.origin;
    }
    get host() {
        return this.url.host;
    }
    get protocol() {
        return this.url.protocol;
    }
    get contentType() {
        return this.headers['content-type'];
    }
    get cookieString() {
        return this.headers['cookie'];
    }
    get isJson() {
        return isType.is(this.contentType, ['json']) === 'json';
    }
    get isText() {
        return isType.is(this.contentType, ['text']) === 'text';
    }
    async json(): Promise<any> {
        if (!this.body) {
            throw new Error('Body is null');
        }
        if (!this.isJson) {
            throw new Error('Content type is not json');
        }
        return (await this.body()).toJSON();
    }
    async text(): Promise<string> {
        if (!this.body) {
            throw new Error('Body is null');
        }
        if (!this.isText) {
            throw new Error('Content type is not text');
        }
        return (await this.body()).toString();
    }
}

export class ApiResponse {
    statusCode: number = 200;
    headers: { [key: string]: string } = {};
    body: Blob | null = null;
    file: string | null = null;
    constructor() {
        this.setHeader('Content-Type', 'text/plain');
        this.setHeader('Server', 'HomeCloud API Server');
    }
    status(status: number) {
        this.statusCode = status;
    }
    setHeader(key: string, value: string) {
        this.headers[key] = value;
    }
    setBody(body: Blob, contentType: string) {
        this.body = body;
        this.setHeader('Content-Type', contentType);
    }
    json(body: any) {
        this.setBody(new Blob([JSON.stringify(body)]), 'application/json');
    }
    text(body: string) {
        this.setBody(new Blob([body]), 'text/plain');
    }
    html(html: string) {
        this.setBody(new Blob([html]), 'text/html');
    }
    sendFile(filePath: string) {
        this.file = filePath;
        this.setHeader('Content-Type', mime.getType(filePath) || 'application/octet-stream');
    }
    sendFileAsDownload(filePath: string, filename: string) {
        this.sendFile(filePath);
        this.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    redirect(url: string) {
        this.status(301);
        this.setHeader('Location', url);
    }
    setCookie(key: string, value: string, ttl: number = 20 * 24 * 60 * 60) {
        this.setHeader('Set-Cookie', cookie.serialize(key, value, {
            maxAge: ttl,
            path: '/',
        }));
    }
}

export type RouteHandler = (request: ApiRequest) => Promise<ApiResponse>;

export type ApiDecoratorHandler = (handler: RouteHandler) => RouteHandler;

export type ApiDecorator = (args: any[]) => ApiDecoratorHandler;

export class RouteGroup {
    queue: { pattern: string, handler: RouteHandler }[] = [];
    constructor() {
    }
    add(pattern: string, arg1: RouteHandler | ApiDecoratorHandler[], arg2?: RouteHandler) {
        let handler: RouteHandler;
        if (!!arg2) {
            handler = arg2;
            for (const decorator of arg1 as ApiDecoratorHandler[]) {
                handler = decorator(handler);
            }
        } else {
            handler = arg1 as RouteHandler;
        }
        this.queue.push({ pattern, handler });
    }
    handle = async (request: ApiRequest): Promise<ApiResponse> => {
        const route = this.queue.find(route => {
            let pattern = request.matchedPattern + route.pattern;
            if (!pattern.endsWith('/') && !pattern.endsWith('/*')) {
                pattern += '/*';
            }
            const matchResult = match(pattern, request.path + '/');
            // console.log('matchResult', matchResult.matches, 'request.path', request.path, 'route.pattern', pattern);
            if (matchResult.matches) {
                if (matchResult.params) {
                    request.urlParams = { ...request.params, ...matchResult.params };
                }
                request.matchedPattern = request.matchedPattern + route.pattern;
                return true;
            }
            return false;
        });
        if (!!route) {
            try {
                return await route.handler(request);
            } catch (e: any) {
                console.error('Internal Server Error', 'URL:', request.url, e);
                const response500 = new ApiResponse();
                response500.status(500);
                let txt = '<h2>500: Internal Server Error</h2>';
                if (envConfig.IS_DEV) {
                    txt += e.message;
                    txt += '<h4>Stack:</h4>' + e.stack;
                }
                response500.html(txt);
                return Promise.resolve(response500);
            }
        }
        console.log('No match found for ' + request.path, 'queue:', this.queue);
        const response404 = new ApiResponse();
        response404.status(404);
        response404.text('Not found: ' + request.path);
        return Promise.resolve(response404);
    }
}
