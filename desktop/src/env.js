// EDIT THIS FILE WITH CAUTION //

// Any changes made here should have a corresponding change in the build script forge.config.js.
// This file will be replaced with actual environment variables during packaging.

require('dotenv').config();

const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    ONEAUTH_APP_ID: process.env.ONEAUTH_APP_ID,
    USE_WEB_APP_SERVER: process.env.USE_WEB_APP_SERVER ? process.env.USE_WEB_APP_SERVER === 'true' : true,
};

module.exports = env;
