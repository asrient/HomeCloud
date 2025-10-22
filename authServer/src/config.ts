import 'dotenv/config';

const defaultSecretKey = 'dev_secret_key';

export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
export const IS_DEV = process.env.NODE_ENV !== 'production';
export const SECRET_KEY = process.env.SECRET_KEY || defaultSecretKey;
export const MONGO_DB_URL = process.env.MONGO_DB_URL || '';
export const DB_NAME = process.env.DB_NAME || ( IS_DEV ? 'mcdev' : 'mcprod' );
export const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
export const REDIS_URL = process.env.REDIS_URL || null;
export const UDP_PORT = process.env.UDP_PORT ? parseInt(process.env.UDP_PORT) : 9669;

export function isRedisEnabled() {
    return REDIS_URL !== null;
}

export function configSetup() {
    // Any adhoc config setup can go here
    console.log(`Application running in ${IS_DEV ? 'development' : 'production'} mode.`);
    if (SECRET_KEY === defaultSecretKey) {
        console.warn('Warning: Using default secret key. This is not secure for production environments.');
    }
    if (!MONGO_DB_URL) {
        throw new Error('env "MONGO_DB_URL" is not set.');
    }
    if (!IS_DEV && BASE_URL.startsWith('http://localhost')) {
        console.warn('Warning: BASE_URL is set to localhost in production mode.');
    }
    if (!isRedisEnabled()) {
        console.log('Info: REDIS_URL is not set. Cache and events will fallback to local only.');
    }
}
