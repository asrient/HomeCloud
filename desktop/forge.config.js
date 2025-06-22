const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP_DESKTOP_ENV_FILE = 'dist/.env.tmp.js';
const DESKTOP_ENV_FILE = 'dist/env.js';

const ALLOWED_NODE_ENVS = ['development', 'production'];

function getEnvFileContent() {
  const NODE_ENV = process.env.NODE_ENV || 'production';
  const USE_WEB_APP_SERVER = process.env.USE_WEB_APP_SERVER === 'true';

  if (!ALLOWED_NODE_ENVS.includes(NODE_ENV)) {
    throw new Error(`NODE_ENV should be one of ${ALLOWED_NODE_ENVS.join(', ')}. Received: ${NODE_ENV}`);
  }

  console.log('NODE_ENV:', NODE_ENV);
  console.log('USE_WEB_APP_SERVER:', USE_WEB_APP_SERVER ? 'true' : 'false');
  console.log('ONEAUTH_APP_ID:', !!process.env.ONEAUTH_APP_ID ? '**hidden**' : 'NOT SET');

  const env = {
    NODE_ENV,
    ONEAUTH_APP_ID: process.env.ONEAUTH_APP_ID,
    USE_WEB_APP_SERVER,
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

module.exports = {
  packagerConfig: {
    asar: {
      unpackDir: 'assets',
    },
    overwrite: true, // Overwrite existing files
    icon: "assets/appIcons/icon",
    publisherName: "ASRIENT",
    appBundleId: "org.homecloud.desktop",
    derefSymlinks: true, // Dereference symlinks
    ignore: [ // doc: https://electron.github.io/packager/main/interfaces/Options.html#ignore
      "^/[.]vs$",
      "^/public$",
      "^/out$",
      "^/build$",
      "^/docs$",
      "^/Debug$",
      "^/src$",
      "^/[.]editorconfig$",
      "^/[.]gitignore$",
      "^/[.]env$",
      "^/web-public$",
      "^/tsconfig[.]json$",
      "[.](cmd|user|DotSettings|njsproj|sln)$",
    ],
    appCategoryType: "public.app-category.productivity",
  },
  hooks: {
    generateAssets: async () => {
      return new Promise((resolve, reject) => {
        console.log('Copying web assets...');
        fs.cp(path.resolve(__dirname, '../web/out'), path.resolve(__dirname, 'assets/web'), { recursive: true }, (err) => {
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

    prePackage: async (forgeConfig, options) => {
      console.log('Generating environment file...');

      const envFileContent = getEnvFileContent();
      // Copy the original env file to a temporary location
      fs.copyFileSync(DESKTOP_ENV_FILE, TMP_DESKTOP_ENV_FILE);
      // Write the new content to the env file
      fs.writeFileSync(DESKTOP_ENV_FILE, envFileContent);

      console.log('Environment file generated!');
    },

    postPackage: async (forgeConfig, options) => {
      console.log('Restoring original environment file...');
      // check if desktop tmp env file exists and restore it
      if (fs.existsSync(TMP_DESKTOP_ENV_FILE)) {
        fs.copyFileSync(TMP_DESKTOP_ENV_FILE, DESKTOP_ENV_FILE);
        fs.unlinkSync(TMP_DESKTOP_ENV_FILE);
      }
      console.log('Original environment file restored!');
    }
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
      name: '@electron-forge/maker-dmg',
      config: {
        icon: "assets/appIcons/icon.icns",
        format: "ULFO",
        overwrite: true,
      }
    },
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
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
