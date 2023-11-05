import { Router } from 'express';
import { Apps } from '../../models.js';
import { getAccount } from '../../middlewares.js';

const app = Router();
app.use(getAccount);

app.post('/create', async function (req, res) {
    if (!req._account) {
        res.apiError(401, "Unauthorized");
        return;
    }
    const account = req._account;
    const { name, description, redirectOrigins } = req.body;
    if (!redirectOrigins || !Array.isArray(redirectOrigins)) {
        res.apiError(400, "Redirect origins is required");
        return;
    }
    if(!name || name.length === 0) {
        res.apiError(400, "Name is required");
        return;
    }
    try {
        const app = await Apps.createNew(account, name, description, redirectOrigins);
        res.apiSuccess(201, {
            id: app._id.toString(),
            name: app.name,
            description: app.description,
            redirectOrigins: app.redirect_origins,
        });
    } catch (e) {
        res.apiError(400, e.message);
        return;
    }
});

app.post('/update', async function (req, res) {
    if (!req._account) {
        res.apiError(401, "Unauthorized");
        return;
    }
    const account = req._account;
    const { appId, description, redirectOrigins } = req.body;
    if (!redirectOrigins || !Array.isArray(redirectOrigins)) {
        res.apiError(400, "Redirect origins is required");
    }
    if (!appId) {
        res.apiError(400, "App Id is required");
        return;
    }
    const app = await Apps.getById(appId);
    if (!app) {
        res.apiError(400, "Invalid App Id");
        return;
    }
    if (app.owner != null && app.owner.toString() !== account._id.toString()) {
        res.apiError(403, "You don't have permission to update this app");
        return;
    }
    try {
        await app.update({ description, redirectOrigins });
        res.apiSuccess(200, {
            id: app._id.toString(),
            name: app.name,
            description: app.description,
            redirectOrigins: app.redirect_origins,
        });
    } catch (e) {
        res.apiError(400, e.message);
        return;
    }
}
);

app.post('/delete', async function (req, res) {
    if (!req._account) {
        res.apiError(401, "Unauthorized");
        return;
    }
    const account = req._account;
    const { appId } = req.body;
    if (!appId) {
        res.apiError(400, "App Id is required");
        return;
    }
    const result = await Apps.deleteByOwner(account, appId);
    if (result.deletedCount === 0) {
        res.apiError(400, "Invalid App Id or you don't have permission to delete this app");
        return;
    } else {
        res.apiSuccess(200, {
            appId,
        });
    }
})

export default app;
