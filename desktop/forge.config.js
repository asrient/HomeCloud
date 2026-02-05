const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP_DESKTOP_ENV_FILE = 'dist/.env.tmp.js';
const DESKTOP_ENV_FILE = 'dist/env.js';

const ALLOWED_NODE_ENVS = ['development', 'production'];

function getEnvFileContent() {
  const NODE_ENV = process.env.NODE_ENV || 'production';
  const USE_WEB_APP_SERVER = process.env.USE_WEB_APP_SERVER === 'true';
  const SERVER_URL = process.env.SERVER_URL;
  const WS_SERVER_URL = process.env.WS_SERVER_URL;

  if (!SERVER_URL) {
    throw new Error(`SERVER_URL is not set`);
  }

  if (!WS_SERVER_URL) {
    throw new Error(`WS_SERVER_URL is not set`);
  }

  if (!ALLOWED_NODE_ENVS.includes(NODE_ENV)) {
    throw new Error(`NODE_ENV should be one of ${ALLOWED_NODE_ENVS.join(', ')}. Received: ${NODE_ENV}`);
  }

  console.log('NODE_ENV:', NODE_ENV);
  console.log('USE_WEB_APP_SERVER:', USE_WEB_APP_SERVER ? 'true' : 'false');
  console.log('APP_ID:', !!process.env.APP_ID ? '**hidden**' : 'NOT SET');
  console.log('SERVER_URL:', SERVER_URL || 'NOT SET');
  console.log('WS_SERVER_URL:', WS_SERVER_URL || 'NOT SET');

  const env = {
    NODE_ENV,
    APP_ID: process.env.APP_ID,
    USE_WEB_APP_SERVER,
    UI_THEME: null,
    SERVER_URL,
    WS_SERVER_URL,
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

// Platform-specific modules to exclude
const WINDOWS_ONLY_MODULES = [
  'node-audio-volume-mixer',
];

function getIgnorePatterns(platform) {
  const basePatterns = [
    // Project folders to ignore
    "^/[.]vs$",
    "^/public$",
    "^/out$",
    // Keep build/Release for native modules, but ignore build config files and debug symbols
    "^/build/binding[.]Makefile$",
    "^/build/config[.]gypi$",
    "^/build/gyp-mac-tool$",
    "^/build/Makefile$",
    "^/build/[^/]+[.]target[.]mk$",
    "^/build/Release/[.]deps$",
    "^/build/Release/[.]forge-meta$",
    "^/build/Release/obj[.]target$",
    "^/build/Release/obj$",
    // Exclude debug symbols and build artifacts (~22MB savings)
    "[.]pdb$",   // Windows debug symbols
    "[.]iobj$",  // Incremental linking object files
    "[.]ipdb$",  // Incremental PDB files
    "[.]lib$",   // Static library files (not needed at runtime)
    "[.]exp$",   // Export files (not needed at runtime)
    "^/docs$",
    "^/Debug$",
    "^/src$",
    "^/addons$",
    "^/[.]editorconfig$",
    "^/[.]gitignore$",
    "^/[.]env$",
    "^/web-public$",
    "^/tsconfig[.]json$",
    "^/binding[.]gyp$",
    "[.](cmd|user|DotSettings|njsproj|sln)$",
    // Exclude TypeScript source and definition files
    "[.]ts$",
    "[.]tsx$",
    "[.]d[.]ts$",
    "[.]map$",
    // Exclude test and documentation files in node_modules
    "/node_modules/[^/]+/(test|tests|__tests__|spec|specs|example|examples|doc|docs|coverage|[.]github|[.]vscode)/",
    "/node_modules/[^/]+/[A-Z]+[.]md$",
    "/node_modules/@types/",
    // Note: source-map and source-map-support are required by sqlite3 at runtime
    // Exclude unnecessary fluent-ffmpeg folders (11MB coverage folder!)
    "/node_modules/fluent-ffmpeg/(coverage|doc|tools|OLD|[.]vscode)/",
    // Exclude moment locale files (~4MB) - Sequelize only needs core moment
    "/node_modules/moment/locale/",
    // Note: moment-timezone/data is required at runtime - don't exclude it
  ];

  // Exclude Windows-only modules on non-Windows platforms
  if (platform !== 'win32') {
    for (const mod of WINDOWS_ONLY_MODULES) {
      basePatterns.push(`/node_modules/${mod}/`);
    }
  }

  return basePatterns;
}

module.exports = {
  packagerConfig: {
    asar: {
      unpackDir: '{assets,build/Release}',
    },
    prune: true,  // Explicitly prune devDependencies
    overwrite: true, // Overwrite existing files
    icon: "assets/appIcons/icon",
    publisherName: "ASRIENT",
    appBundleId: "org.homecloud.desktop",
    derefSymlinks: true, // Dereference symlinks
    // ignore is set dynamically in prePackage hook
    appCategoryType: "public.app-category.productivity",
  },
  hooks: {
    generateAssets: async () => {
      const webAssetsDir = path.resolve(__dirname, 'assets/web');
      const webOutDir = path.resolve(__dirname, '../web/out');

      // Clean existing web assets to remove old build artifacts
      if (fs.existsSync(webAssetsDir)) {
        console.log('Cleaning old web assets...');
        fs.rmSync(webAssetsDir, { recursive: true, force: true });
      }

      return new Promise((resolve, reject) => {
        console.log('Copying web assets...');
        fs.cp(webOutDir, webAssetsDir, { recursive: true }, (err) => {
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
      // Set platform-specific ignore patterns
      const platform = options.platform;
      console.log(`Packaging for platform: ${platform}`);
      forgeConfig.packagerConfig.ignore = getIgnorePatterns(platform);
      console.log(`Ignore patterns set for ${platform}`);

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

      // Remove unnecessary auto-generated files to reduce package size
      const outputPath = options.outputPaths[0];
      const filesToRemove = [
        'LICENSES.chromium.html',  // ~14MB Chromium licenses
        'LICENSE',
        'version',
      ];

      console.log('Cleaning up unnecessary files...');
      for (const file of filesToRemove) {
        const filePath = path.join(outputPath, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Removed: ${file}`);
        }
      }

      // Remove unnecessary locale files (keep only en-US.pak)
      // This saves ~40MB
      const localesPath = path.join(outputPath, 'locales');
      if (fs.existsSync(localesPath)) {
        const localeFiles = fs.readdirSync(localesPath);
        const keepLocales = ['en-US.pak', 'en-GB.pak']; // Add more if needed
        for (const file of localeFiles) {
          if (!keepLocales.includes(file)) {
            fs.unlinkSync(path.join(localesPath, file));
          }
        }
        console.log(`Removed ${localeFiles.length - keepLocales.length} unused locale files`);
      }

      console.log('Cleanup complete!');
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
    // new FusesPlugin({
    //   version: FuseVersion.V1,
    //   [FuseV1Options.RunAsNode]: false,
    //   [FuseV1Options.EnableCookieEncryption]: true,
    //   [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    //   [FuseV1Options.EnableNodeCliInspectArguments]: false,
    //   [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    //   [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // }),
  ],
};
