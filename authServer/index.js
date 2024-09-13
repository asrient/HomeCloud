import 'dotenv/config';
import express from "express";
import cookieParser from 'cookie-parser';
import { connect } from 'mongoose';

import manage from './paths/manage.js';
import authFlow from './paths/authFlow.js';
import api from './paths/api.js';
import { Apps } from './models.js';

connect(process.env.MONGO_DB_URL).then(() => {
  console.log("Connected to MongoDB.");
  Apps.setupSettingsApp();
});

const app = express();
app.set('port', process.env.PORT || 5050);
app.set('views', './pages');
app.disable('x-powered-by');
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('./exposed'));
app.use(cookieParser());

// Attach routes
app.get('/', function (_req, res) {
  res.render("index", {});
});

app.use('/flow', authFlow);
app.use('/api', api);
app.use('/manage', manage);

// Handle 404
app.use(function (_req, res) {
  res.status(404);
  res.render('404', {});
});

app.listen(app.get('port'), () => console.log(`Auth Server started on port ${app.get('port')}`));
