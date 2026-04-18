#!/usr/bin/env node
// Entry point for the @asrient/homecloud-server CLI.
//
// Default (no subcommand): run the server in the foreground.
//   npx @asrient/homecloud-server -p <pass> -c ./creds.json
//
// Subcommands manage a background instance via PM2 (invoked through `npx pm2`,
// no global install needed):
//   start       — run detached as `homecloud-server`
//   stop        — stop the background instance
//   restart     — restart it
//   logs        — tail logs
//   status      — show pm2 status
//   delete      — remove from pm2
//
// Examples:
//   npx @asrient/homecloud-server start -p mypass -c ./creds.json
//   npx @asrient/homecloud-server logs
//   npx @asrient/homecloud-server stop

const path = require('path');
const { spawnSync } = require('child_process');

const PM2_NAME = 'homecloud-server';
const SERVER_SCRIPT = path.resolve(__dirname, '..', 'dist', 'index.js');
const PM2_SUBCOMMANDS = new Set(['start', 'stop', 'restart', 'logs', 'status', 'delete']);

const sub = process.argv[2];

if (!sub || !PM2_SUBCOMMANDS.has(sub)) {
    // Foreground / default behavior — run the server in-process.
    require('../dist/index.js');
    return;
}

// Background mode — shell out to pm2 via `npx -y pm2 ...` so users don't
// need a global pm2 install.
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const passthrough = process.argv.slice(3);

let pm2Args;
switch (sub) {
    case 'start':
        pm2Args = ['-y', 'pm2', 'start', SERVER_SCRIPT, '--name', PM2_NAME, '--', ...passthrough];
        break;
    case 'stop':
    case 'restart':
    case 'delete':
        pm2Args = ['-y', 'pm2', sub, PM2_NAME, ...passthrough];
        break;
    case 'logs':
        pm2Args = ['-y', 'pm2', 'logs', PM2_NAME, ...passthrough];
        break;
    case 'status':
        pm2Args = ['-y', 'pm2', 'list', ...passthrough];
        break;
}

const result = spawnSync(npxBin, pm2Args, { stdio: 'inherit' });
if (result.error) {
    console.error('Failed to invoke pm2:', result.error.message);
    process.exit(1);
}

if (sub === 'start' && result.status === 0) {
    console.log(`\nHomeCloud server started in the background as "${PM2_NAME}".`);
    console.log('  Logs:    npx @asrient/homecloud-server logs');
    console.log('  Stop:    npx @asrient/homecloud-server stop');
    console.log('  Restart: npx @asrient/homecloud-server restart');
    console.log('\nTo auto-start pm2 on boot: https://pm2.keymetrics.io/docs/usage/startup/');
}

process.exit(result.status ?? 0);
