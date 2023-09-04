import { Router } from 'express';
import { Apps, PendingAuths, Sessions } from '../../models.js';
import { isValidStorageType } from '../../serviceProvider.js';
import { getSession, getAccount } from '../../middlewares.js';
import { getProvider } from '../../serviceProvider.js';

const app = Router();
app.use(getSession);
app.use(getAccount);

const BASE_URL = process.env.BASE_URL;

app.post('/initiate', async function (req, res) {
    const { appId, storageType, redirectUrl } = req.body;
    console.log('initiate', req.body);
    if (!appId || !storageType || !redirectUrl) {
        res.apiError(400, "Invalid Request body");
        return;
    }
    const app = await Apps.getById(appId);
    if (app == null) {
        res.apiError(400, "Invalid App Id");
        return;
    }
    if (!isValidStorageType(storageType)) {
        res.apiError(400, "Invalid Storage Type: " + storageType);
        return;
    }
    try {
        const pendingAuth = await PendingAuths.createNew(app, storageType, redirectUrl);
        res.apiSuccess(201, {
            referenceId: pendingAuth.reference_id,
            partialCode1: pendingAuth.partial_code_1,
            authUrl: BASE_URL + 'flow/auth?ref=' + pendingAuth.reference_id,
        });
    } catch (e) {
        res.apiError(400, e.message);
        return;
    }
});

app.post('/token', async function (req, res) {
    if (!req._session) {
        res.apiError(401, "Unauthorized");
        return;
    }
    const session = req._session;
    const account = session.account;
    let provider;
    try {
        provider = getProvider(account.storage_type);
    } catch (e) {
        res.apiError(400, e.message);
        return;
    }
    try {
        const token = await provider.getAccessToken(account.refresh_token);
        res.apiSuccess(200, {
            token,
            app: {
                id: session.app._id.toString(),
                name: session.app.name,
            },
            account: {
                id: account._id.toString(),
                targetId: account.target_id,
                storageType: account.storage_type,
            },
        });
    }
    catch (e) {
        res.apiError(400, e.message);
    }
})

app.post('/delete', async function (req, res) {
    if (!req._session && !req._account) {
        res.apiError(401, "Unauthorized");
        return;
    }

    let session = req._session;
    if (!session) {
        if (!req.body.sessionId) {
            res.apiError(400, "Session Id is required");
            return;
        }
        session = await Sessions.getById(req.body.sessionId);
        if (session.account._id.toString() !== req._account._id.toString()) {
            res.apiError(401, "Unauthorized");
            return;
        }
    }
    await session.del();
    res.apiSuccess(201, { message: "Session removed" });
})

export default app;
