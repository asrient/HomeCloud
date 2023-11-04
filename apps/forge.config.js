const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');

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
    overwrite: true,
    protocols: [
      {
        name: "HomeCloud Desktop",
        schemes: ["homecloud"]
      }
    ],
    extraResource: [
      path.resolve(__dirname, 'node_modules/ffmpeg-static', os.platform() !== 'win32' ? 'ffmpeg' : 'ffmpeg.exe'),
      path.resolve(__dirname, 'node_modules/ffprobe-static/bin', os.platform(), os.arch(), os.platform() !== 'win32' ? 'ffprobe' : 'ffprobe.exe'),
    ],
    ignore: [
      "^/[.]vs$",
      "^/public$",
      "^/out$",
      "^/docs$",
      "^/bin/node$",
      "^/bin/nodeData$",
      "^/src$",
      "^/[.]editorconfig$",
      "^/[.]gitignore$",
      "^/[.]env$",
      "^/web-public$",
      "^/tsconfig[.]json$",
      "[.](cmd|user|DotSettings|njsproj|sln)$"
    ],
    icon: "appIcons/icon",
    appCopyright: "@ASRIENT",
    publisherName: "ASRIENT",
    appBundleId: "org.homecloud.desktop",
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
    {
      name: '@electron-forge/maker-dmg', 
      config: {
        icon: "appIcons/icon.icns",
        format: "ULFO",
        overwrite: true,
      }
    }
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'asrient',
          name: 'HomeCloud'
        },
        prerelease: true,
        draft: true,
      }
    }
  ],
  hooks: {
    generateAssets: async () => {
      return new Promise((resolve, reject) => {
      console.log('On hook packageAfterExtract');
      fs.cp(path.resolve(__dirname, '../web/out'), path.resolve(__dirname, 'bin/web'), {recursive: true}, (err) => {
        if (err) {
          console.error(err);
          reject(err);
        } else {
          resolve();
          console.log('Files copied!');
        }
      });
    });
    },
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
    // Auto Unpack Native Modules Plugin removed for now since it's breaking sharp module.
    // {
    //   name: '@electron-forge/plugin-auto-unpack-natives',
    //   config: {},
    // },
  ],
  appCategoryType: "public.app-category.productivity",
};
