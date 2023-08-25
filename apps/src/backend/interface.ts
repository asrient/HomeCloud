import qs, { ParsedQs } from 'qs';
import isType from 'type-is';
import cookie from 'cookie';
import mime from 'mime';
import { match } from 'node-match-path';


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
        url: string,
        headers: { [key: string]: string },
        public body: Blob | null = null,
        public downloadAttachedFiles: (() => Promise<string[]>) | null = null,
    ) {
        this.method = method.toUpperCase();

        if(url.endsWith('/') && url.length > 1) {
            url = url.substring(0, url.length - 1);
        }
        this.url = new URL(url);
        this.params = qs.parse(this.url.search, { ignoreQueryPrefix: true });

        this.headers = {};
        for (const key in headers) {
            this.headers[key.toLowerCase()] = headers[key];
        }
        if (this.cookieString) {
            this.cookies = cookie.parse(this.cookieString);
        }
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
    async json(): Promise<any> {
        if (!this.body) {
            throw new Error('Body is null');
        }
        if (!this.isJson) {
            throw new Error('Content type is not json');
        }
        return Buffer.from(await this.body.arrayBuffer()).toJSON();
    }
}

export class ApiResponse {
    status: number = 200;
    headers: { [key: string]: string } = {};
    body: Blob | null = null;
    file: string | null = null;
    constructor() {
        this.setHeader('Content-Type', 'text/plain');
        this.setHeader('Server', 'HomeCloud API Server');
    }
    setStatus(status: number) {
        this.status = status;
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
    sendFile(filePath: string) {
        this.file = filePath;
        this.setHeader('Content-Type', mime.getType(filePath) || 'application/octet-stream');
    }
    sendFileAsDownload(filePath: string, filename: string) {
        this.sendFile(filePath);
        this.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    redirect(url: string) {
        this.setStatus(301);
        this.setHeader('Location', url);
    }
    setCookie(key: string, value: string, ttl: number = 20 * 24 * 60 * 60) {
        this.setHeader('Set-Cookie', cookie.serialize(key, value, {
            maxAge: ttl,
            path: '/',
        }));
    }
}


export class RouteGroup {
    queue: { pattern: string, handler: (request: ApiRequest) => Promise<ApiResponse> }[] = [];
    constructor() {
    }
    add(pattern: string, handler: (request: ApiRequest) => Promise<ApiResponse>) {
        this.queue.push({ pattern, handler });
    }
    handle = (request: ApiRequest): Promise<ApiResponse> => {
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
            return route.handler(request);
        }
        console.log('No match found for ' + request.path, 'queue:', this.queue);
        const response404 = new ApiResponse();
        response404.setStatus(404);
        response404.text('Not found');
        return Promise.resolve(response404);
    }
}
