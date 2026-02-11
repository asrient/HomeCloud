// EDIT THIS FILE WITH CAUTION //

// Any changes made here should have a corresponding change in the build script forge.config.js.
// This file will be replaced with actual environment variables during packaging.

require('dotenv').config();

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4000';

function deriveWsUrl(serverUrl) {
    const isSecure = serverUrl.startsWith('https://');
    const url = serverUrl.replace(/^https?:\/\//, isSecure ? 'wss://' : 'ws://');
    console.log(`Derived WS_SERVER_URL: ${url} from SERVER_URL: ${serverUrl}`);
    return url;
}

const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    USE_WEB_APP_SERVER: true,
    UI_THEME: process.env.UI_THEME || null,
    SERVER_URL,
    WS_SERVER_URL: process.env.WS_SERVER_URL || deriveWsUrl(SERVER_URL),
};

module.exports = env;
