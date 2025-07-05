const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
// This can be replaced with `find-yarn-workspace-root`
const appSharedDist = path.resolve(projectRoot, '../appShared/dist');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [appSharedDist];
// 2. Let Metro know where to resolve packages and in what order
config.resolver.extraNodeModules = {
    'shared': path.resolve(appSharedDist),
}

module.exports = config;
