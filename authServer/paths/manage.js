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
