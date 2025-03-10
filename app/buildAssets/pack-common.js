'use-strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP_PACKAGE_JSON = '.package.tmp.json';
const TMP_DESKTOP_ENV_FILE = 'src/.env.tmp.js';
const DESKTOP_ENV_FILE = 'src/env.js';

const ALLOWED_NODE_ENVS = ['development', 'production'];

function getEnvFileContent(packageJson) {
    if (!process.env.CLIENT_BASE_URL) {
        throw new Error('CLIENT_BASE_URL environment variable is required to be set.');
    }

    const NODE_ENV = process.env.NODE_ENV || 'production';

    if (!ALLOWED_NODE_ENVS.includes(NODE_ENV)) {
        throw new Error(`NODE_ENV should be one of ${ALLOWED_NODE_ENVS.join(', ')}. Received: ${NODE_ENV}`);
    }

    console.log('NODE_ENV:', NODE_ENV);
    console.log('CLIENT_BASE_URL:', process.env.CLIENT_BASE_URL);
    console.log('ONEAUTH_SERVER_URL:', process.env.ONEAUTH_SERVER_URL || 'NOT SET');
    console.log('ONEAUTH_APP_ID:', !!process.env.ONEAUTH_APP_ID ? '**hidden**' : 'NOT SET');

    if (process.env.ONEAUTH_SERVER_URL && !process.env.ONEAUTH_APP_ID) {
        throw new Error('ONEAUTH_APP_ID environment variable is required to be set.');
    }

    const env = {
        NODE_ENV,
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
// Contains hard coded environment variables, do not commit to git.

const env = ${JSON.stringify(env, null, 2)};

module.exports = env;
`;
    return txt;
}

function getAllDeps(nodeModulesPath, moduleName) {
    const modulePath = path.join(nodeModulesPath, moduleName, 'package.json');
    if (!fs.existsSync(modulePath)) return [];
    console.log(`Getting all dependencies from: ${modulePath}`);
    const packageJson = JSON.parse(fs.readFileSync(modulePath, 'utf8'));
    const deps = Object.keys(packageJson.dependencies || []);
    const optionalDeps = Object.keys(packageJson.optionalDependencies || []);
    const allDeps = deps.concat(optionalDeps);
    const childrenDeps = allDeps.reduce((acc, dep) => {
        return acc.concat(getAllDeps(nodeModulesPath, dep));
    }, []);
    return allDeps.concat(childrenDeps);
}

function prepack() {
    console.log(`Fixing the codebase for Desktop...`);

    const originalPackageJson = fs.readFileSync('package.json', 'utf8');
    const packageJson = JSON.parse(originalPackageJson);


    const envFileContent = getEnvFileContent(packageJson);
    // Copy the original env file to a temporary location
    fs.copyFileSync(DESKTOP_ENV_FILE, TMP_DESKTOP_ENV_FILE);
    // Write the new content to the env file
    fs.writeFileSync(DESKTOP_ENV_FILE, envFileContent);


    // copy the file to a temporary location
    fs.copyFileSync('package.json', TMP_PACKAGE_JSON);

    packageJson.devDependencies = {};

    const unpackDirs = packageJson.unpackDirs || [];
    unpackDirs.push(path.join('helpers', os.platform()));
    let unpackModules = packageJson.unpackModules || [];
    const nodeModulesPath = path.join(__dirname, '..', 'node_modules');

    const moduleSet = new Set([]);
    unpackModules.forEach(dir => {
        moduleSet.add(dir);
        const deps = getAllDeps(nodeModulesPath, dir);
        deps.forEach(dep => moduleSet.add(dep));
    });
    unpackModules = Array.from(moduleSet.values());
    let patternStr = '{';
    patternStr += unpackDirs.join(',');
    if (unpackDirs.length > 0 && unpackModules.length > 0) {
        patternStr += ',';
    }
    if (unpackModules.length > 0) {
        patternStr += `node_modules/{${unpackModules.join(',')}}`;
    }
    patternStr += '}';
    packageJson.build.unpackDir = patternStr;
    console.log('Unpack dirs:', packageJson.build.unpackDir);

    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
}

function postpack() {
    console.log('Setting the codebase back to normal...');
    // package.json
    fs.copyFileSync(TMP_PACKAGE_JSON, 'package.json');
    fs.unlinkSync(TMP_PACKAGE_JSON);

    // check if desktop tmp env file exists and restore it
    if (fs.existsSync(TMP_DESKTOP_ENV_FILE)) {
        fs.copyFileSync(TMP_DESKTOP_ENV_FILE, DESKTOP_ENV_FILE);
        fs.unlinkSync(TMP_DESKTOP_ENV_FILE);
    }
}

module.exports = { prepack, postpack };
