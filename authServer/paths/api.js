import { Router } from 'express';
import session from './apis/session.js';
import appApi from './apis/app.js';
import { apiResponse } from '../middlewares.js';

const app = Router();
app.use(apiResponse);

app.use('/session', session);
app.use('/app', appApi);

export default app;
