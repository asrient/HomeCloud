//import { Sessions, Accounts } from './models.js';
import { Request, Response, NextFunction } from 'express';
import { IS_DEV } from './config';
import CustomError from './customError';
import { authenticate } from './lib';
import { validateData, setTokenContext, getTokenContext } from './expressHelper';


export function handleErrors(error: Error, req: Request, res: Response, next: NextFunction) {
    const statusCode = error instanceof CustomError ? 400 : 500;
    const customError = CustomError.from(error);
    if (IS_DEV) {
        console.error(JSON.stringify(customError.toObject(true), null, 2));
    }
    res.status(statusCode).json(customError.toObject(IS_DEV));
}

export function logRequests(req: Request, res: Response, next: NextFunction) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
}

export function setupRequestContext(req: Request, res: Response, next: NextFunction) {
    req.ctx = {};
    next();
}

export async function auth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['token'];
    // console.log("Auth Header:", authHeader);
    if (authHeader && typeof authHeader === 'string') {
        try {
            setTokenContext(req, await authenticate(authHeader));
        } catch (error) {
            // ignore 
            console.debug("Authentication failed:", error);
        }
    }
    next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (!getTokenContext(req)) {
        res.status(401).json(CustomError.security('Authentication required').toObject(IS_DEV));
        return;
    }
    next();
}

export function validateBody(schema: any) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            validateData(req.body, schema);
            next();
        } catch (error) {
            next(error);
        }
    }
}
