const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

function fixPackageJson(packageJson) {
  const oldDeps = packageJson.dependencies;
  let devDeps = packageJson.devDependencies;
  const desktopDeps = packageJson.desktopDependencies;
  const deps = {};
  for (const dep of desktopDeps) {
    if (oldDeps[dep]) {
      deps[dep] = oldDeps[dep];
      delete oldDeps[dep];
    } else {
      throw new Error(`Desktop dependency ${dep} not found in dependencies`);
    }
  }
  packageJson.dependencies = deps;
  devDeps = { ...devDeps, ...oldDeps };
  packageJson.devDependencies = devDeps;
  return packageJson;
}

module.exports = {
  packagerConfig: {
    asar: true,
    ignore: [
      "^/[.]vs$",
      "^/public$",
      "^/out$",
      "^/docs$",
      "^/bin/node$",
      "^/src$",
      "^/[.]editorconfig$",
      "^/tsconfig[.]json$",
      "[.](cmd|user|DotSettings|njsproj|sln)$"
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  hooks: {
    // generateAssets: async () => {
    //   return new Promise((resolve, reject) => {
    //   console.log('On hook packageAfterExtract');
    //   fs.cp(path.resolve(__dirname, 'dist'), path.resolve(__dirname, 'web'), {recursive: true}, (err) => {
    //     if (err) {
    //       console.error(err);
    //       reject(err);
    //     } else {
    //       resolve();
    //       console.log('Files copied!');
    //     }
    //   });
    // });
    // },
    packageAfterPrune: async (forgeConfig, buildPath) => {
      console.log('packageAfterCopy hook ---> build path:', buildPath);
      return new Promise((resolve, reject) => {
        exec('npm prune --production', { cwd: buildPath }, (err, stdout, stderr) => {
          if (err) {
            console.error(err);
            reject(err);
          } else {
            console.log('npm prune finished.');
            resolve();
            console.log('packageAfterCopy hook finished --->');
          }
        });
      });
    },
    readPackageJson: async (forgeConfig, packageJson) => {
      console.log('On hook readPackageJson!!');
      return new Promise((resolve, reject) => {
        const newPackageJson = fixPackageJson(packageJson);
        resolve(newPackageJson);
      });
    }
  },
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
