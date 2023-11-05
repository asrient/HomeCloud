import { Router } from 'express';
import { getAccount } from '../middlewares.js';
import { Apps } from '../models.js';

const app = Router();
app.use(getAccount);

app.get('/', async function (req, res) {
    if (!req._account) {
        res.redirect('/manage/login');
        return;
    }
    const account = req._account;
    const sessions = await account.getMySessions();
    const apps = await account.getMyApps();
    res.render("manage/index", {
        account,
        sessions,
        apps,
    });
});

app.get('/app/:id', async function (req, res) {
    if (!req._account) {
        res.redirect('/manage/login');
        return;
    }
    const account = req._account;
    const appId = req.params.id;
    const app = await Apps.getById(appId);
    if (!app) {
        res.render("error", { error: "App doesn't exist.", code: "APPID_INVALID" });
    }
    if (app.owner != null && app.owner.toString() !== account._id.toString()) {
        res.render("error", { error: "You don't have permission to view this page.", code: "ACCESS_DENIED" });
    }
    res.render("manage/appDetails", {
        account,
        app,
    });
});

app.get('/newApp', async function (req, res) {
    if (!req._account) {
        res.redirect('/manage/login');
        return;
    }
    res.render("manage/newApp", {});
});

app.get('/login', async function (_req, res) {
    const settingsApp = await Apps.getSettingsApp();
    res.render("manage/login", {
        settingsAppId: settingsApp._id.toString(),
    });
});

export default app;
