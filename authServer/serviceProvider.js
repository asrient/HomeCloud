import { google } from 'googleapis';
import { Dropbox } from 'dropbox';

const REDIRECT_URL = process.env.BASE_URL + 'flow/callback';

export class ServiceProvider {
    constructor() {
        if (!this.constructor.canRun()) {
            throw new Error('This Service provider cannot run');
        }
    }
    async getRedirectUrl(referenceId) {
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

    async getRedirectUrl(referenceId) {
        return this._client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/userinfo.profile',
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
            console.log('Failed to get tokens: ' + e.message);
            throw new Error('Failed to get tokens: ' + e.message);
        }
        this._client.setCredentials(tokens);
        const oauth2 = google.oauth2({
            auth: this._client,
            version: 'v2'
        });
        try {
            const { data: { id, name, picture } } = await oauth2.userinfo.get();
            return {
                id,
                name,
                picture,
                refreshToken: tokens.refresh_token,
                accessToken: tokens.access_token,
                expiryDate: tokens.expiry_date
            };
        } catch (e) {
            console.log('Failed to get user info: ' + e.message);
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
        this._client = new Dropbox({
            clientId: process.env.DROPBOX_CLIENT_ID,
            clientSecret: process.env.DROPBOX_CLIENT_SECRET
        });
    }

    static canRun() {
        return process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET;
    }

    async getRedirectUrl(referenceId) {
        return this._client.auth.getAuthenticationUrl(REDIRECT_URL, referenceId, 'code', 'offline', null, 'none', false);
    }

    async getAccountDetails(code) {
        const { result } = await this._client.auth.getAccessTokenFromCode(REDIRECT_URL, code);
        this._client.auth.setRefreshToken(result.refresh_token);
        const expiry_date = new Date().getTime() + result.expires_in * 1000;
        return {
            id: result.account_id,
            name: 'Dropbox User',
            refreshToken: result.refresh_token,
            accessToken: result.access_token,
            expiryDate: expiry_date,
        };
    }

    async getAccessToken(refreshToken) {
        this._client.auth.setRefreshToken(refreshToken);
        await this._client.auth.checkAndRefreshAccessToken();
        const access_token = this._client.auth.getAccessToken();
        const expiryDate = this._client.auth.getAccessTokenExpiresAt();
        return {
            accessToken: access_token,
            expiryDate: expiryDate.getTime(),
        }
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
