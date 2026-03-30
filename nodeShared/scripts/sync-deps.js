#!/usr/bin/env node

/**
 * Syncs nodeShared's dependencies to downstream packages (desktop, server).
 *
 * Each downstream package.json should have an "ownDependencies" array listing
 * package names that it manages itself. These are never added/removed/updated
 * by this script.
 *
 * Any non-local dependency in the downstream that is NOT in ownDependencies
 * is considered managed by this script:
 *   - If it's in nodeShared deps: kept (added or version-updated)
 *   - If it's NOT in nodeShared deps: removed
 *
 * Local path deps (starting with . / ~) are always left alone.
 */

const fs = require('fs');
const path = require('path');

const DOWNSTREAM = [
    path.resolve(__dirname, '../../desktop/package.json'),
    path.resolve(__dirname, '../../server/package.json'),
];

function isLocalPath(version) {
    return version.startsWith('.') || version.startsWith('/') || version.startsWith('~');
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return null;
    }
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function main() {
    const nodeSharedPkg = readJson(path.resolve(__dirname, '../package.json'));
    if (!nodeSharedPkg) {
        console.error('[sync-deps] Could not read nodeShared/package.json');
        process.exit(1);
    }

    // Get nodeShared's non-local dependencies
    const sharedDeps = {};
    for (const [name, version] of Object.entries(nodeSharedPkg.dependencies || {})) {
        if (!isLocalPath(version)) {
            sharedDeps[name] = version;
        }
    }

    const sharedDepNames = new Set(Object.keys(sharedDeps));
    console.log(`[sync-deps] nodeShared deps: ${[...sharedDepNames].join(', ')}`);

    for (const pkgPath of DOWNSTREAM) {
        const pkg = readJson(pkgPath);
        if (!pkg) {
            console.log(`[sync-deps] Skipping ${pkgPath} (not found)`);
            continue;
        }

        const pkgName = pkg.name || path.basename(path.dirname(pkgPath));
        const ownDeps = new Set(pkg.ownDependencies || []);
        const deps = pkg.dependencies || {};
        let changed = false;

        // 1. Add/update nodeShared deps (skip ownDependencies)
        for (const [name, version] of Object.entries(sharedDeps)) {
            if (ownDeps.has(name)) continue;

            if (!deps[name]) {
                deps[name] = version;
                console.log(`[sync-deps] ${pkgName}: + ${name}@${version}`);
                changed = true;
            } else if (deps[name] !== version) {
                console.log(`[sync-deps] ${pkgName}: ~ ${name} ${deps[name]} -> ${version}`);
                deps[name] = version;
                changed = true;
            }
        }

        // 2. Remove deps not in nodeShared and not in ownDependencies
        for (const name of Object.keys(deps)) {
            if (isLocalPath(deps[name])) continue;
            if (ownDeps.has(name)) continue;
            if (!sharedDepNames.has(name)) {
                console.log(`[sync-deps] ${pkgName}: - ${name} (not in nodeShared or ownDependencies)`);
                delete deps[name];
                changed = true;
            }
        }

        if (changed) {
            pkg.dependencies = deps;
            writeJson(pkgPath, pkg);
            console.log(`[sync-deps] ${pkgName}: updated`);
        } else {
            console.log(`[sync-deps] ${pkgName}: in sync`);
        }
    }
}

main();
