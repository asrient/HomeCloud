const fs = require('fs');

const TMP_PACKAGE_JSON = '.package.tmp.json';
const TMP_DESKTOP_ENV_FILE = 'src/desktop/.env.tmp.js';
const DESKTOP_ENV_FILE = 'src/desktop/env.js';

function getEnvFileContent(packageJson) {
    if (!process.env.CLIENT_BASE_URL) {
        throw new Error('CLIENT_BASE_URL environment variable is required to be set.');
    }
    console.log('CLIENT_BASE_URL:', process.env.CLIENT_BASE_URL);
    console.log('ONEAUTH_SERVER_URL:', process.env.ONEAUTH_SERVER_URL);
    if (process.env.ONEAUTH_SERVER_URL && !process.env.ONEAUTH_APP_ID) {
        throw new Error('ONEAUTH_APP_ID environment variable is required to be set.');
    }
    const env = {
        NODE_ENV: 'production',
        CLIENT_BASE_URL: process.env.CLIENT_BASE_URL,
        DESKTOP_IS_PACKAGED: true,
        ONEAUTH_SERVER_URL: process.env.ONEAUTH_SERVER_URL,
        ONEAUTH_APP_ID: process.env.ONEAUTH_APP_ID,
        VERSION: packageJson.version,
        APP_NAME: packageJson.name,
    };
    const txt = `
// BY ASRIENT
// Auto-generated file. Do not edit.
// Contains hard coded environment variables for desktop, should not be committed to the repository.

const env = ${JSON.stringify(env, null, 2)};

module.exports = env;
`;
    return txt;
}

function prepack(type) {
    console.log(`Fixing the codebase for ${type}...`);
    const originalPackageJson = fs.readFileSync('package.json', 'utf8');
    const packageJson = JSON.parse(originalPackageJson);

    // copy the file to a temporary location
    fs.copyFileSync('package.json', TMP_PACKAGE_JSON);

    // update the package.json file
    packageJson.main = `dist/${type}/index.js`;
    let deps = Object.keys(packageJson.dependencies);
    const key = `${type === 'desktop' ? 'server' : 'desktop'}OnlyDeps`;
    const serverOnlyDeps = packageJson[key] || [];
    deps = deps.filter(dep => !serverOnlyDeps.includes(dep));
    packageJson.dependencies = deps.reduce((acc, dep) => {
        acc[dep] = packageJson.dependencies[dep];
        return acc;
    }, {});
    packageJson.devDependencies = {};

    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));

    if (type === 'desktop') {
        const envFileContent = getEnvFileContent(packageJson);
        // Copy the original env file to a temporary location
        fs.copyFileSync(DESKTOP_ENV_FILE, TMP_DESKTOP_ENV_FILE);
        // Write the new content to the env file
        fs.writeFileSync(DESKTOP_ENV_FILE, envFileContent);
    }
}

function postpack() {
    console.log('Setting the codebase back to normal...');
    // package.json
    fs.copyFileSync(TMP_PACKAGE_JSON, 'package.json');
    fs.unlinkSync(TMP_PACKAGE_JSON);

    // check if desktop tmp file exists and restore it
    if (fs.existsSync(TMP_DESKTOP_ENV_FILE)) {
        fs.copyFileSync(TMP_DESKTOP_ENV_FILE, DESKTOP_ENV_FILE);
        fs.unlinkSync(TMP_DESKTOP_ENV_FILE);
    }
}

module.exports = { prepack, postpack };
