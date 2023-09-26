import jwt from 'jsonwebtoken';
import { envConfig } from '../envConfig';

export function validateUsernameString(name: string) : [boolean, string] {
    name = name.trim().toLowerCase();
    if (name.length < 4) return [false, 'Username must be at least 4 characters long.'];
    if (name.length > 20) return [false, 'Username must be at most 20 characters long.'];
    if (!/^[a-zA-Z0-9_]+$/.test(name)) return [false, 'Username must only contain letters, numbers, and underscores.'];
    return [true, name];
}

export function validatePasswordString(password: string) : [boolean, string] {
    password = password.trim();
    if (password.length < 6) return [false, 'Password must be at least 6 characters long.'];
    if (password.length > 25) return [false, 'Password must be at most 25 characters long.'];
    return [true, password];
}

export function generateJwt(profileId: number) {
    return jwt.sign({ profileId }, envConfig.SECRET_KEY, { expiresIn: '30d' });
}

export function verifyJwt(token: string) {
    if(!token) return null;
    try {
        const payload = jwt.verify(token, envConfig.SECRET_KEY) as jwt.JwtPayload;
        return payload.profileId;
    } catch (e) {
        return null;
    }
}
