import { Schema, model } from 'mongoose';
import { code, time, createHash, stringToUrlOrigin, uniqueCode } from './utils.js';

const SECRET_KEY = process.env.SECRET_KEY;
const SETTINGS_APP_NAME = 'Settings';

// App

const appSchema = new Schema({
    name: String,
    created_on: Number,
    description: String,
    redirect_origins: [String],
    owner: { type: Schema.Types.ObjectId, ref: 'accounts' },
});

appSchema.methods.isRedirectUrlValid = function (redirectUrl) {
    const redirectOrigin = stringToUrlOrigin(redirectUrl);
    if (this.isSettingsApp()) {
        return redirectOrigin.startsWith(process.env.BASE_URL);
    }
    return this.redirect_origins.includes(redirectOrigin);
}

appSchema.methods.isSettingsApp = function () {
    return this.name === SETTINGS_APP_NAME && this.owner == null;
}

appSchema.methods.update = async function ({ description, redirectOrigins }) {
    if (description !== undefined) {
        this.description = description;
    }

    if (redirectOrigins !== undefined) {
        redirectOrigins = redirectOrigins.map(stringToUrlOrigin);
        this.redirect_origins = redirectOrigins;
    }

    return await this.save();
}

appSchema.statics.getById = async function (id) {
    return await this.findById(id).exec();
}

appSchema.statics.createNew = async function (owner, appName, description, redirectOrigins) {
    if (!redirectOrigins) redirectOrigins = [];
    redirectOrigins = redirectOrigins.map(stringToUrlOrigin);
    if (this.name == null || this.name.length < 4) throw new Error("App name is required");
    const existingApp = await Apps.findOne({ name: this.name }).exec();
    if (existingApp != null) {
        throw new Error("App with same name already exists");
    }
    const app = new Apps({
        name: appName,
        created_on: time(),
        description: description || '',
        redirect_origins: redirectOrigins,
        owner: owner ? owner._id : null,
    });
    return await app.save();
}

appSchema.statics.deleteByOwner = async function (owner, appId) {
    return await Apps.deleteOne({ owner: owner._id, _id: appId }).exec();
}

appSchema.statics.setupSettingsApp = async function () {
    const existingApp = await Apps.findOne({ name: SETTINGS_APP_NAME }).exec();
    if (existingApp != null) {
        return existingApp;
    }
    const app = await this.createNew(null, SETTINGS_APP_NAME, 'Manage your accounts and apps', []);
    console.log("Created settings app, app_id: " + app._id.toString());
    return app;
}

appSchema.statics.getSettingsApp = async function () {
    return await Apps.findOne({ name: SETTINGS_APP_NAME }).exec();
}

// Account

const accountSchema = new Schema({
    target_id: { type: String, required: true },
    email: String,
    name: String,
    picture: String,
    storage_type: String,
    refresh_token: String,
});

accountSchema.statics.getById = async function (id) {
    return await this.findById(id).exec();
}

accountSchema.statics.getByTarget = async function (storageType, targetId) {
    return await this.findOne({ target_id: targetId, storage_type: storageType });
}

accountSchema.statics.createNew = async function (targetId, storageType, refreshToken) {
    if (!refreshToken) throw new Error("Refresh token is required");
    const r = new Accounts({
        target_id: targetId,
        storage_type: storageType,
        refresh_token: refreshToken
    });
    return await r.save();
}

accountSchema.statics.getOrCreate = async function (targetId, storageType, refreshToken) {
    let r = await this.getByTarget(storageType, targetId);
    if (r == null) {
        r = await this.createNew(targetId, storageType, refreshToken);
    } else if(refreshToken && r.refresh_token !== refreshToken) {
        r.refresh_token = refreshToken;
        await r.save();
    }
    return r;
}

accountSchema.methods.updatePublicInfo = async function ({ email, name, picture }) {
    if (email !== undefined) {
        this.email = email;
    }
    if (name !== undefined) {
        this.name = name;
    }
    if (picture !== undefined) {
        this.picture = picture;
    }
    return await this.save();
}

accountSchema.methods.getMySessions = async function () {
    return await Sessions.find({ account: this._id })
        .sort({ last_active: -1 })
        .limit(30)
        .populate('app')
        .exec();
}

accountSchema.methods.deleteMySessions = async function (sessionIds) {
    return await Sessions.deleteMany({ account: this._id, _id: { $in: sessionIds } }).exec();
}

accountSchema.methods.getMyApps = async function () {
    return await Apps.find({ owner: this._id })
        .sort({ created_on: -1 })
        .exec();
}

accountSchema.methods.deleteMyApps = async function (appIds) {
    return await Apps.deleteMany({ owner: this._id, _id: { $in: appIds } }).exec();
}

// Session

const sessionSchema = new Schema({
    account: { type: Schema.Types.ObjectId, ref: 'accounts', required: true },
    api_key_hash: { type: String, required: true },
    app: { type: Schema.Types.ObjectId, ref: 'apps', required: true },
    last_active: Number,
    created_on: Number,
});

sessionSchema.methods.del = async function () {
    console.log("Deleting session: ", this._id.toString());
    await Sessions.deleteOne({ _id: this._id }).exec();
}

sessionSchema.methods.updateLastActive = async function () {
    this.last_active = time();
    return await this.save();
}

sessionSchema.statics.getByApiKey = async function (apiKey, appId) {
    const apiKeyHash = createHash(apiKey + SECRET_KEY);
    return await this.findOne({ api_key_hash: apiKeyHash, app: appId })
        .populate(['account', 'app'])
        .exec();
}

sessionSchema.statics.getById = async function (id) {
    return await this.findById(id)
        .populate(['account', 'app'])
        .exec();
}

sessionSchema.statics.createNew = async function (accountId, appId, apiKey) {
    const apiKeyHash = createHash(apiKey + SECRET_KEY);
    const r = new Sessions({
        account: accountId,
        app: appId,
        api_key_hash: apiKeyHash,
        last_active: time(),
        created_on: time(),
    });
    const session = await r.save();
    return session.populate(['account', 'app']);
}

sessionSchema.statics.createFromPendingAuth = async function (pendingAuth, account) {
    if (account == null || pendingAuth == null) {
        throw new Error("Account or pendingAuth not found");
    }
    const partialCode2 = code(10);
    const partialCode1 = pendingAuth.partial_code_1;
    const app = pendingAuth.app;
    if (pendingAuth.storage_type !== account.storage_type) {
        throw new Error("Storage type mismatch");
    }
    const apiKey = createHash(partialCode1 + partialCode2);
    const session = await this.createNew(account._id, app._id, apiKey);
    await pendingAuth.del();
    return {
        session,
        apiKey,
        partialCode2,
    };
}

// Pending Auth

const pendingAuthSchema = new Schema({
    app: { type: Schema.Types.ObjectId, ref: 'apps' },
    reference_id: { type: String, required: true, unique: true },
    partial_code_1: String,
    storage_type: String,
    redirect_url: String,
    expires_on: Number,
});

pendingAuthSchema.methods.del = async function () {
    console.log("Deleting pending auth: ", this.reference_id);
    await PendingAuths.deleteOne({ _id: this._id }).exec();
}

pendingAuthSchema.statics.getByReferenceId = async function (referenceId) {
    return await this.findOne({ reference_id: referenceId })
        .populate('app')
        .exec();
}

pendingAuthSchema.statics.createNew = async function (app, storageType, redirectUrl) {
    if (!app) throw new Error("App not found");
    if (!app.isRedirectUrlValid(redirectUrl)) throw new Error("Redirect url not allowed");
    if (redirectUrl.includes('?')) throw new Error("Redirect url cannot contain query parameters");
    const referenceId = uniqueCode();
    const partialCode1 = code(10);
    const r = new PendingAuths({
        reference_id: referenceId,
        app: app._id,
        partial_code_1: partialCode1,
        storage_type: storageType,
        redirect_url: redirectUrl,
        expires_on: time() + 60 * 60 * 1000,
    });
    const pendingAuth = await r.save();
    console.log("Created pending auth: ", pendingAuth);
    return pendingAuth.populate('app');
}

pendingAuthSchema.statics.deleteExpired = async function () {
    const now = time();
    return await PendingAuths.deleteMany({
        "$or": [
            { expires_on: { $lt: now } },
            { expires_on: undefined },
            { expires_on: null },
        ]
    }).exec();
}

export const Apps = model('apps', appSchema);
export const Accounts = model('accounts', accountSchema);
export const Sessions = model('sessions', sessionSchema);
export const PendingAuths = model('pending_auths', pendingAuthSchema);
