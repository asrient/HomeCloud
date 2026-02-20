const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP_DESKTOP_ENV_FILE = 'dist/.env.tmp.js';
const DESKTOP_ENV_FILE = 'dist/env.js';
const MSIX_MANIFEST_TEMPLATE = path.resolve(__dirname, 'msix/AppxManifest.xml');
const MSIX_MANIFEST_OUT = path.resolve(__dirname, 'msix/AppxManifest.generated.xml');
const MSIX_ASSETS_DIR = path.resolve(__dirname, 'msix/assets');

const MSIX_CERT_FILE = process.env.MSIX_CERT_FILE;
const MSIX_CERT_PASSWORD = process.env.MSIX_CERT_PASSWORD;
const BUILD_MSIX = process.env.BUILD_MSIX === 'true';

const ALLOWED_NODE_ENVS = ['development', 'production'];

function getEnvFileContent() {
  const NODE_ENV = process.env.NODE_ENV || 'production';
  const USE_WEB_APP_SERVER = process.env.USE_WEB_APP_SERVER === 'true';
  const SERVER_URL = process.env.SERVER_URL;

  if (!SERVER_URL) {
    throw new Error(`SERVER_URL is not set`);
  }

  const isSecure = SERVER_URL.startsWith('https://');
  const WS_SERVER_URL = process.env.WS_SERVER_URL || SERVER_URL.replace(/^https?:\/\//, isSecure ? 'wss://' : 'ws://');

  if (!ALLOWED_NODE_ENVS.includes(NODE_ENV)) {
    throw new Error(`NODE_ENV should be one of ${ALLOWED_NODE_ENVS.join(', ')}. Received: ${NODE_ENV}`);
  }

  console.log('NODE_ENV:', NODE_ENV);
  console.log('USE_WEB_APP_SERVER:', USE_WEB_APP_SERVER ? 'true' : 'false');
  console.log('SERVER_URL:', SERVER_URL || 'NOT SET');
  console.log('WS_SERVER_URL:', WS_SERVER_URL || 'NOT SET');

  const env = {
    NODE_ENV,
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

/**
 * Generates AppxManifest.xml from the template with the correct values.
 * This is needed to declare network capabilities (privateNetworkClientServer,
 * internetClientServer) required for local network features like mDNS, TCP server,
 * and UDP sockets that the default auto-generated manifest doesn't include.
 */
function generateMsixManifest(arch) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
  const publisher = process.env.APPX_PUBLISHER || 'CN=HomeCloud Dev';
  const displayName = process.env.APPX_DISPLAY_NAME || 'HomeCloud App';
  const version = pkg.version.replace(/^(\d+\.\d+\.\d+).*$/, '$1.0'); // Ensure 4-part version
  const appExecutable = `${pkg.productName || pkg.name}.exe`;

  const vars = {
    '{{IdentityName}}': 'Asrient.HomeCloudApp',
    '{{ProcessorArchitecture}}': arch || 'x64',
    '{{Version}}': version,
    '{{Publisher}}': publisher,
    '{{DisplayName}}': displayName,
    '{{PublisherDisplayName}}': 'Asrient',
    '{{MinOSVersion}}': '10.0.19041.0',
    '{{MaxOSVersionTested}}': '10.0.22621.0',
    '{{AppExecutable}}': appExecutable,
    '{{AppDisplayName}}': displayName,
    '{{PackageDescription}}': pkg.description || displayName,
  };

  let template = fs.readFileSync(MSIX_MANIFEST_TEMPLATE, 'utf-8');
  for (const [key, value] of Object.entries(vars)) {
    template = template.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  fs.writeFileSync(MSIX_MANIFEST_OUT, template);
  console.log('Generated MSIX manifest at', MSIX_MANIFEST_OUT);
  return MSIX_MANIFEST_OUT;
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

    prePackage: async (forgeConfig, platform, arch) => {
      // Set platform-specific ignore patterns
      console.log(`Packaging for platform: ${platform}`);
      forgeConfig.packagerConfig.ignore = getIgnorePatterns(platform);
      console.log(`Ignore patterns set for ${platform}`);

      // Generate MSIX manifest for Windows builds
      if (platform === 'win32') {
        arch = arch || 'x64';
        generateMsixManifest(arch);
      }

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
        'version',
        // Squirrel updater is not needed in MSIX builds
        ...(BUILD_MSIX ? ['Squirrel.exe'] : []),
      ];

      console.log('Cleaning up unnecessary files...');
      for (const file of filesToRemove) {
        const filePath = path.join(outputPath, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Removed: ${file}`);
        } else {
          console.warn(`File not found for removal: ${file}`);
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
    },

    postMake: async (forgeConfig, makeResults) => {
      // Clean up generated MSIX manifest after makers have finished
      if (fs.existsSync(MSIX_MANIFEST_OUT)) {
        fs.unlinkSync(MSIX_MANIFEST_OUT);
        console.log('Cleaned up generated MSIX manifest');
      }

      // Rename artifacts to remove version from filenames for fixed download URLs
      const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
      const escapedVersion = pkg.version.replace(/[.]/g, '\\.');
      const versionPattern = new RegExp(`[-\\s]${escapedVersion}`, 'g');

      for (const result of makeResults) {
        result.artifacts = result.artifacts.map(artifactPath => {
          const dir = path.dirname(artifactPath);
          const oldName = path.basename(artifactPath);
          const newName = oldName.replace(versionPattern, '').replace(/darwin/g, 'macos');
          if (newName !== oldName) {
            const newPath = path.join(dir, newName);
            fs.renameSync(artifactPath, newPath);
            console.log(`Renamed: ${oldName} -> ${newName}`);
            return newPath;
          }
          return artifactPath;
        });
      }

      return makeResults;
    }
  },
  rebuildConfig: {},
  makers: [
    ...(!BUILD_MSIX ? [
      {
        name: '@electron-forge/maker-squirrel',
        config: {
          authors: 'Asrient',
        },
      },
    ] : []),
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    // {
    //   name: '@electron-forge/maker-dmg',
    //   config: {
    //     icon: "assets/appIcons/icon.icns",
    //     format: "ULFO",
    //     overwrite: true,
    //   }
    // },
    // MSIX maker for Store uploads only — set BUILD_MSIX=true to include
    ...(BUILD_MSIX ? [{
      name: '@electron-forge/maker-msix',
      config: (() => {
        if (MSIX_CERT_FILE && MSIX_CERT_PASSWORD) {
          console.log('Configuring MSIX with signing.');
          return {
            appManifest: MSIX_MANIFEST_OUT,
            packageAssets: MSIX_ASSETS_DIR,
            windowsSignOptions: {
              certificateFile: MSIX_CERT_FILE,
              certificatePassword: MSIX_CERT_PASSWORD,
            },
          };
        }
        console.log('Configuring MSIX without signing.');
        return {
          appManifest: MSIX_MANIFEST_OUT,
          packageAssets: MSIX_ASSETS_DIR,
          sign: false,
        };
      })()
    }] : []),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'asrient',
          name: 'HomeCloud'
        },
        prerelease: false,
        draft: false,
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
