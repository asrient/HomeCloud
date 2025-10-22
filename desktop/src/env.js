// EDIT THIS FILE WITH CAUTION //

// Any changes made here should have a corresponding change in the build script forge.config.js.
// This file will be replaced with actual environment variables during packaging.

require('dotenv').config();

const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    USE_WEB_APP_SERVER: true,
    UI_THEME: process.env.UI_THEME || null,
    SERVER_URL: 'http://localhost:4000',
    WS_SERVER_URL: 'ws://localhost:4000',
    APP_ID: process.env.APP_ID || null,
};

module.exports = env;
