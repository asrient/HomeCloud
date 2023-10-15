import { staticConfig } from '@/lib/staticConfig';
import { ErrorType, ErrorResponse } from '../types';
import CustomError from '../customError';

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
            if(FormData.prototype.isPrototypeOf(body)) {
                console.log('fetch: form data');
                fetchOptions.body = body;
                fetchOptions.headers = {};
            } else {
                fetchOptions.body = JSON.stringify(body);
            }
        }
        let response: Response;
        try {
            response = await fetch(`${apiBaseUrl}${path}`, fetchOptions);
        } catch (e: any) {
            throw new CustomError(ErrorType.Network, `Network error: ${e.message}`);
        }
        const isJson = response.headers.get('Content-Type')?.includes('application/json');
        if (!response.ok) {
            if (isJson) {
                const data: ErrorResponse = await response.json();
                throw CustomError.fromErrorResponse(data.error);
            }
            throw new CustomError(ErrorType.Generic, `Request failed with status ${response.status}`);
        }
        if (isJson) {
            return await response.json();
        }
        return await response.text();
    }

    static async get<T>(path: string, params?: string | string[][] | Record<string, string> | URLSearchParams): Promise<T> {
        return await this._call('GET', path, params);
    }

    static async post<T>(path: string, params?: any, body?: any): Promise<T> {
        if (!body) {
            body = params;
            params = undefined;
        }
        return await this._call('POST', path, params, body);
    }
}
