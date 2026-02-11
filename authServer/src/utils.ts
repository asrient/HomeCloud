import crypto from 'crypto';
import CustomError from './customError';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import z from 'zod';
import { SECRET_KEY } from './config';
import { TokenType } from './types';
import { TokenSchema } from './schema';

export function time() {
    return new Date().getTime();
}

export function code(length = 10) {
    return crypto.randomBytes(length).toString('hex');
}

export function generatePin(length = 6) {
    let pin = '';
    for (let i = 0; i < length; i++) {
        pin += Math.floor(Math.random() * 10).toString();
    }
    return pin;
}

export function uniqueCode() {
    return crypto.randomUUID();
}

export function createHash(text: string) {
    return crypto.createHash('md5').update(text).digest('hex');
}

export function stringToUrlOrigin(url: string) {
    const parts = url.split('://');
    const protocol = parts[0];
    const domain = parts[1].split('/')[0];
    return `${protocol}://${domain}/`;
}


export function generateJwtToken(data: TokenType): string {
    return jwt.sign(data, SECRET_KEY, { expiresIn: '60d' });
}

export function verifyJwtToken(token: string): TokenType {
    if (!token) throw new Error('No token provided');
    const payload = jwt.verify(token, SECRET_KEY);
    // console.log("JWT Payload:", payload);
    const parsed = TokenSchema.safeParse(payload);
    if (!parsed.success) {
        throw CustomError.security('Invalid JWT token payload');
    }
    return parsed.data;
}

export function toObjectId(id: string | ObjectId): ObjectId {
    if (id instanceof ObjectId) {
        return id;
    }
    if (typeof id === 'string') {
        if (!ObjectId.isValid(id)) {
            throw new Error(`Invalid ObjectId: ${id}`);
        }
        return new ObjectId(id);
    }
    throw new Error('Invalid ObjectId input');
}

export function objectIdtoStr(id: string | ObjectId): string {
    if (typeof id === 'string') {
        return id;
    }
    if (id instanceof ObjectId) {
        return id.toString("hex");
    }
    throw new Error('Invalid ObjectId input');
}

export function zodToCustomError(error: any): CustomError {
    if (error instanceof z.ZodError) {
        const validationErrors: { [key: string]: string[] } = {};
        (error as z.ZodError<any>).issues.forEach((err) => {
            const field = err.path.join('.');
            if (!validationErrors[field]) {
                validationErrors[field] = [];
            }
            validationErrors[field].push(err.message);
        });
        return CustomError.validation(validationErrors);
    }
    return error;
}


export function isIpV4(address: string): boolean {
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(address);
}

export function isSameNetwork(netA: string, netB: string): boolean {
    const partsA = netA.split('.').map(part => parseInt(part, 10));
    const partsB = netB.split('.').map(part => parseInt(part, 10));
    if (partsA.length !== 4 || partsB.length !== 4) {
        return false;
    }
    return partsA[0] === partsB[0] && partsA[1] === partsB[1];
}

/* 
Check if an IP address is in a local/private range
VALID RANGES:
- 10.0.0.0 to 10.255.255.255
- 172.16.0.0 to 172.31.255.255
- 192.168.0.0 to 192.168.255.255
- 127.0.0.0 to 127.255.255.255 (localhost)
*/
export function isLocalIp(address: string): boolean {
    if (!isIpV4(address)) {
        return false;
    }
    const parts = address.split('.').map(part => parseInt(part, 10));
    return (
        parts[0] === 10 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 127)
    );
}

export function isLoopbackIp(address: string): boolean {
    if (!isIpV4(address)) {
        return false;
    }
    const parts = address.split('.').map(part => parseInt(part, 10));
    return parts[0] === 127;
}
