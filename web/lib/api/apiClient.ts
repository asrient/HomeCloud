import { staticConfig } from '@/lib/staticConfig';

export type ErrorData = {
    message: string;
    errors?: { [key: string]: string[] };
};

export class ApiClient {

    private constructor() {
    }

    private static async _call(method: string, path: string, params?: any, body?: any): Promise<any> {
        const apiBaseUrl = staticConfig.apiBaseUrl;
        if (!apiBaseUrl) {
            throw new Error('No api base url');
        }
        const isCors = apiBaseUrl !== window.location.origin;
        if (params) {
            const query = new URLSearchParams(params);
            path += '?' + query.toString();
        }
        const fetchOptions: RequestInit = {
            method,
            mode: isCors ? 'cors' : 'no-cors',
            credentials: 'include',
            referrerPolicy: 'no-referrer',
            headers: {
                'Content-Type': 'application/json',
            },
        };
        if (body) {
            fetchOptions.body = JSON.stringify(body);
        }
        const response = await fetch(`${apiBaseUrl}${path}`, fetchOptions);
        const isJson = response.headers.get('Content-Type')?.includes('application/json');
        if (!response.ok) {
            if (isJson) {
                const data = await response.json();
                throw new Error(data.message || 'Http error', data);
            }
            throw new Error(`Http error: ${response.status} ${response.statusText}`);
        }
        if (isJson) {
            return await response.json();
        }
        return await response.text();
    }

    static async get<T>(path: string, params?: any): Promise<T> {
        return await this._call('GET', path, params);
    }

    static async post<T>(path: string, params: any, body?: any): Promise<T> {
        if (!body) {
            body = params;
            params = undefined;
        }
        return await this._call('POST', path, params, body);
    }
}
