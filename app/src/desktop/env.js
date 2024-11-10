// EDIT THIS FILE WITH CAUTION //

// Any changes made here should have a corresponding change in the build script pack-common.js.
// This file will be replaced with actual environment variables during packaging.

require('dotenv').config();
const packageJson = require('../../package.json');

const env = {
    NODE_ENV: process.env.NODE_ENV,
    CLIENT_BASE_URL: process.env.CLIENT_BASE_URL,
    DESKTOP_IS_PACKAGED: false,
    ONEAUTH_SERVER_URL: process.env.ONEAUTH_SERVER_URL,
    ONEAUTH_APP_ID: process.env.ONEAUTH_APP_ID,
    VERSION: `${packageJson.version}-dev`,
    APP_NAME: packageJson.name,
};

module.exports = env;
