#!/usr/bin/env node

/**
 * Sets up the HomeCloud Server for development or first-time use.
 * Installs dependencies and builds appShared, nodeShared, and server.
 * 
 * Usage: node tools/setup-server.js
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const packages = [
    { name: 'appShared', dir: 'appShared', install: true, build: 'npm run tsc' },
    { name: 'nodeShared', dir: 'nodeShared', install: true, build: 'npm run tsc' },
    { name: 'server', dir: 'server', install: true, build: 'npm run build' },
];

function run(cmd, cwd) {
    console.log(`  > ${cmd}`);
    execSync(cmd, { cwd, stdio: 'inherit' });
}

function main() {
    console.log('=== HomeCloud Server Setup ===\n');

    for (const pkg of packages) {
        const pkgDir = path.join(ROOT, pkg.dir);
        console.log(`[${pkg.name}]`);

        if (pkg.install) {
            console.log(`  Installing dependencies...`);
            run('npm install', pkgDir);
        }

        if (pkg.build) {
            console.log(`  Building...`);
            run(pkg.build, pkgDir);
        }

        console.log(`  Done.\n`);
    }

    console.log('=== Setup complete ===');
    console.log('\nTo start the server:');
    console.log('  cd server && npm start');
    console.log('\nRequired env vars: PASSPHRASE, CREDS_PATH or CREDS_BASE64');
    console.log('Generate creds with: node tools/create-server-creds.js');
}

main();
