import { google } from 'googleapis';
import { DropboxAuth } from 'dropbox';

const REDIRECT_URL = process.env.BASE_URL + 'flow/callback';

export class ServiceProvider {
    constructor() {
        if (!this.constructor.canRun()) {
            throw new Error('This Service provider cannot run');
        }
    }
    getRedirectUrl(referenceId) {
        throw new Error('Not implemented');
    }

    async getAccountDetails(code) {
        throw new Error('Not implemented');
    }

    async getAccessToken(refreshToken) {
        throw new Error('Not implemented');
    }

    static canRun() {
        return false;
    }
}


export class GoogleServiceProvider extends ServiceProvider {

    constructor() {
        super();
        this._client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            REDIRECT_URL
        );
    }

    static canRun() {
        return process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;
    }

    getRedirectUrl(referenceId) {
        return this._client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/userinfo.profile',
                'https://www.googleapis.com/auth/userinfo.email',
            ],
            state: referenceId,
            // to get refresh token every time 
            // https://github.com/googleapis/google-api-nodejs-client/issues/750#issuecomment-368873635
            prompt: 'consent'
        });
    }

    async getAccountDetails(code) {
        let tokens;
        try {
            tokens = (await this._client.getToken(code)).tokens;
        }
        catch (e) {
            throw new Error('Failed to get tokens: ' + e.message);
        }
        this._client.setCredentials(tokens);
        const oauth2 = google.oauth2({
            auth: this._client,
            version: 'v2'
        });
        try {
            const { data: { id, email, name, picture } } = await oauth2.userinfo.get();
            return {
                id,
                email,
                name,
                picture,
                refreshToken: tokens.refresh_token,
                accessToken: tokens.access_token,
                expiryDate: tokens.expiry_date
            };
        } catch (e) {
            throw new Error('Failed to get user info: ' + e.message);
        }
    }

    async getAccessToken(refreshToken) {
        const { tokens } = await this._client.refreshToken(refreshToken);
        return {
            accessToken: tokens.access_token,
            expiryDate: tokens.expiry_date,
        }
    }
}

export class DropboxServiceProvider extends ServiceProvider {

    constructor() {
        super();
        this._client = new DropboxAuth({
            clientId: process.env.DROPBOX_CLIENT_ID,
            clientSecret: process.env.DROPBOX_CLIENT_SECRET
        });
    }

    static canRun() {
        return process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET;
    }

    getRedirectUrl(referenceId) {
        return this._client.getAuthenticationUrl(REDIRECT_URL, referenceId, 'code');
    }

    async getAccountDetails(code) {
        const { result: { account_id, email, refresh_token } } = await this._client.getAccessTokenFromCode(REDIRECT_URL, code);
        return {
            id: account_id,
            email,
            name: 'Dropbox User',
            refreshToken: refresh_token
        };
    }

    async getAccessToken(refreshToken) {
        const { result: { access_token } } = await this._client.refreshAccessToken(refreshToken);
        return access_token;
    }
}

export function getProvider(storageType) {
    switch (storageType) {
        case 'google':
            return new GoogleServiceProvider();
        case 'dropbox':
            return new DropboxServiceProvider();
        default:
            throw new Error('Invalid storage type');
    }
}

export const storageTypes = ['google', 'dropbox'];

export function isValidStorageType(storageType) {
    return storageTypes.includes(storageType);
}
