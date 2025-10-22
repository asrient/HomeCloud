import { Request, Response } from 'express';
import z from 'zod';
import { zodToCustomError } from './utils';
import { TokenType } from 'types';

export function validateData<T>(data: any, schema: z.ZodType<T>): T {
    try {
        return schema.parse(data);
    } catch (error) {
        throw zodToCustomError(error);
    }
}

export function postFn<T>(apiFunc: (data: T, req: Request) => Promise<any> | any, schema?: z.ZodType<T>) {
    return async (req: Request, res: Response) => {
        if (schema) {
            validateData<T>(req.body, schema);
        }
        const result = await apiFunc(req.body as T, req);
        res.status(200).json(result);
    }
}

export function getFn<T>(apiFunc: (data: T | undefined, req: Request) => Promise<any> | any, schema?: z.ZodType<T>) {
    return async (req: Request, res: Response) => {
        if (schema) {
            validateData<T>(req.query, schema);
        }
        const result = await apiFunc(req.query as T, req);
        res.status(200).json(result);
    }
}

export function getContext<T>(req: Request, key: string): T | undefined {
    return req.ctx[key];
}

export function setContext(req: Request, key: string, value: any): void {
    req.ctx[key] = value;
}

export function setTokenContext(req: Request, tokenData: TokenType): void {
    req.ctx['token_data'] = tokenData;
}

export function getTokenContext(req: Request): TokenType | undefined {
    return req.ctx['token_data'] as TokenType;
}

export function getTokenContextOrThrow(req: Request): TokenType {
    const tokenData = getTokenContext(req);
    if (!tokenData) {
        throw new Error('Token data not found in request context');
    }
    return tokenData;
}
