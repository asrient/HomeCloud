import { readFileSync } from 'fs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.SECRET_KEY;

export function read(file) {
    return readFileSync(file, 'utf8', (err, data) => {
        if (err) throw err;
        return (data);
    });
}

export function time() {
    return new Date().getTime();
}

export function code(length = 10) {
    return crypto.randomBytes(length).toString('hex');
}

export function createHash(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}

export function stringToUrlOrigin(url) {
    const parts = url.split('://');
    const protocol = parts[0];
    const domain = parts[1].split('/')[0];
    return `${protocol}://${domain}/`;
}


export function generateJwt(accountId) {
    return jwt.sign({ accountId }, SECRET_KEY, { expiresIn: '2d' });
}

export function verifyJwt(token) {
    if(!token) return null;
    const payload = jwt.verify(token, SECRET_KEY);
    return payload.accountId;
}
