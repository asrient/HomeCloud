import { app, BrowserWindow, safeStorage, protocol, dialog, shell } from 'electron';
import path from 'node:path';
import env from './env';
import { handleProtocols } from './protocols';
import { DesktopConfigType } from './types';
import { setModules, ModulesType } from 'shared/modules';
import { getExistingServiceController } from 'shared/utils';
import CryptoImpl from './cryptoImpl';
import DesktopServiceController from './services/desktopServiceController';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import DesktopConfigStorage from './configStorage';
import { OSType, UITheme } from 'shared/types';
import { createTray } from './tray';
import { createWindow } from './window';
import { checkForUpdates } from './updateCheck';
import { setupAppMenu } from './appMenu';
import { UserPreferences } from './types';
import { createCrashReportLink } from 'shared/helpLinks';
import log from 'electron-log/main';
import { isAppContainerWin } from './appContainer';

const isDev = !!env && env.NODE_ENV === 'development';

let didAppCrash = false;

log.initialize();
log.errorHandler.startCatching({
  showDialog: false,
  onError({ error }) {
    didAppCrash = true;
    if (app.isReady()) {
      showCrashDialogAndQuit(error);
    } else {
      app.once('ready', () => {
        showCrashDialogAndQuit(error);
      });
    }
    // Prevent default handling
    return false;
  },
});

log.transports.file.maxSize = 3 * 1024 * 1024; // 3 MB — auto-rotates to *.old.log

log.transports.file.level = isDev ? 'silly' : 'info';
log.transports.console.level = isDev ? 'silly' : 'info';

console.log('[App] Logger initialized.');

Object.assign(console, log.functions);

const showCrashDialogAndQuit = (error: Error) => {
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: app.getName(),
    message: `${app.getName()} has crashed`,
    detail: 'This was unexpected. Help us fix this by reporting the issue on GitHub.',
    buttons: ['Ignore', 'Report It'],
  });
  if (choice === 1) {
    const details = [
      `**Error:** ${error.message}`,
      `**Time:** ${new Date().toISOString()}`,
      `**App Version:** ${app.getVersion()}`,
      `**OS:** ${process.platform} ${os.release()}`,
      `**Arch:** ${process.arch}`,
      `**Is Packaged:** ${app.isPackaged}`,
      `**Is Dev Mode:** ${isDev}`,
      '',
      '**Stack Trace:**',
      '```',
      error.stack || 'N/A',
      '```',
    ].join('\n');
    shell.openExternal(createCrashReportLink('Desktop', error.message, details));
  }
  app.quit();
};

require('@electron/remote/main').initialize();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// Skip for MSIX — Windows handles install/uninstall lifecycle for packaged apps.
if (!isAppContainerWin() && require('electron-squirrel-startup')) {
  app.quit();
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[App] Another instance is running. Exiting...');
  app.quit();
}

console.log('[App] Starting Electron app...');
console.log('[App] Version:', app.getVersion(), '| Electron:', process.versions.electron, '| Node:', process.versions.node, '| Platform:', process.platform, process.arch);

// Use separate data directory for development
if (isDev) {
  console.log('[App] Running in development mode.');
  app.setName(`${app.getName()}-dev`);
  app.setPath('userData', `${app.getPath('userData')}-dev`);
}

const cryptoModule = new CryptoImpl();

function createOrGetSecretKey(dataDir: string) {
  const secretKeyPath = path.join(dataDir, "secret.key");
  if (!fs.existsSync(secretKeyPath)) {
    console.log("[App] Secret key not found. Creating a new one.");
    const secretKey = cryptoModule.generateRandomKey();
    const encrypted = safeStorage.encryptString(secretKey);
    fs.mkdirSync(path.dirname(secretKeyPath), { recursive: true });
    fs.writeFileSync(secretKeyPath, encrypted);
    console.log("[App] Secret key created.");
    return secretKey;
  }
  const text = fs.readFileSync(secretKeyPath);
  const decrypted = safeStorage.decryptString(text);
  return decrypted;
}

async function getOrGenerateKeys(dataDir: string) {
  const privateKeyPath = path.join(dataDir, "private.pem.key");
  const publicKeyPath = path.join(dataDir, "public.pem.key");
  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    console.log("[App] Key pair not found. Generating a new one.");
    const { privateKey, publicKey } = await cryptoModule.generateKeyPair();
    const privateKeyEncrypted = safeStorage.encryptString(privateKey);
    const publicKeyEncrypted = safeStorage.encryptString(publicKey);
    fs.writeFileSync(privateKeyPath, privateKeyEncrypted);
    fs.writeFileSync(publicKeyPath, publicKeyEncrypted);
    console.log("[App] Key pair generated.");
    return { privateKeyPem: privateKey, publicKeyPem: publicKey };
  }
  const privateKeyText = fs.readFileSync(privateKeyPath);
  const publicKeyText = fs.readFileSync(publicKeyPath);
  const privateKey = safeStorage.decryptString(privateKeyText);
  const publicKey = safeStorage.decryptString(publicKeyText);
  return {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
  };
}

/**
 * Parse a macOS hostname to make it more presentable.
 * e.g., "Aritras-MacBook-Air-13307.local" -> "Aritras MacBook Air"
 */
function parseHostname(hostname: string): string {
  let name = hostname;
  // Remove .local suffix
  name = name.replace(/\.local$/, '');
  // Remove trailing numbers (e.g., -13307)
  name = name.replace(/-\d+$/, '');
  // Replace hyphens with spaces
  name = name.replace(/-/g, ' ');
  // Fix possessive: "Aritras " -> "Aritra's " (common pattern)
  // name = name.replace(/^(\w+)s\s/, "$1's ");
  return name.trim();
}

/**
 * Get the user-friendly device name.
 * On macOS, this returns the "Computer Name" from System Preferences.
 * On other platforms, falls back to os.hostname().
 */
function getDeviceName(): string {
  if (process.platform === 'darwin') {
    try {
      // Get the friendly "Computer Name" on macOS (e.g., "Aritra's MacBook Air")
      const computerName = execSync('scutil --get ComputerName', { encoding: 'utf-8' }).trim();
      if (computerName) {
        return computerName;
      }
    } catch {
      // Fall back to parsed hostname if scutil fails
    }
    // Parse the hostname to make it more presentable
    return parseHostname(os.hostname());
  }
  return os.hostname();
}

async function getConfig() {
  // Set the modules for the app
  const isPackaged = app.isPackaged;
  const dataDir = app.getPath('userData');
  // Temp is the system level cache dir, for our usage we scope it to a subdirectory.
  const cacheDir = path.join(app.getPath('temp'), app.getName());
  // Create the cache directory
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const { privateKeyPem, publicKeyPem } = await getOrGenerateKeys(dataDir);
  const fingerprint = cryptoModule.getFingerprintFromPem(publicKeyPem);
  let uiTheme: UITheme = process.platform === 'darwin' ? UITheme.Macos : UITheme.Win11;
  if (!!env.UI_THEME) {
    if (env.UI_THEME === UITheme.Macos) {
      uiTheme = UITheme.Macos;
    } else if (env.UI_THEME === UITheme.Win11) {
      uiTheme = UITheme.Win11;
    } else {
      console.warn('[App] Invalid UI_THEME value:', env.UI_THEME);
    }
  }
  const desktopConfig: DesktopConfigType = {
    IS_DESKTOP_PACKED: isPackaged,
    IS_DEV: isDev,
    IS_STORE_DISTRIBUTION: isAppContainerWin(),
    USE_WEB_APP_SERVER: env.USE_WEB_APP_SERVER,
    SERVER_URL: env.SERVER_URL,
    WS_SERVER_URL: env.WS_SERVER_URL,
    DATA_DIR: dataDir,
    CACHE_DIR: cacheDir,
    SECRET_KEY: createOrGetSecretKey(dataDir),
    VERSION: app.getVersion(),
    DEVICE_NAME: getDeviceName(),
    PUBLIC_KEY_PEM: publicKeyPem,
    PRIVATE_KEY_PEM: privateKeyPem,
    FINGERPRINT: fingerprint,
    APP_NAME: app.getName(),
    UI_THEME: uiTheme,
    OS: process.platform === 'darwin' ? OSType.MacOS : process.platform === 'win32' ? OSType.Windows : OSType.Linux,
  };
  return desktopConfig;
}

async function initModules() {
  const config = await getConfig();
  const modules: ModulesType = {
    crypto: cryptoModule,
    config,
    ServiceController: DesktopServiceController,
    ConfigStorage: DesktopConfigStorage,
    getLocalServiceController: () => DesktopServiceController.getLocalInstance<DesktopServiceController>(),
    getRemoteServiceController: async (fingerprint: string) => {
      return DesktopServiceController.getRemoteInstance(fingerprint);
    },
    getExistingServiceController,
  };
  setModules(modules, global);
  const serviceController = DesktopServiceController.getLocalInstance<DesktopServiceController>();
  await serviceController.setup();
}

/**
 * Check if the app was started with --hidden flag (auto-start in background)
 */
export function wasStartedInBackground(): boolean {
  return process.argv.includes('--hidden');
}


let APP_RUNNING = false;

async function promptMoveToApplicationsFolder(): Promise<boolean> {
  if (process.platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder()) {
    return false;
  }
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Move to Applications', 'Not Now'],
    defaultId: 0,
    cancelId: 1,
    message: 'Move to Applications folder?',
    detail: `${app.getName()} works best when run from the Applications folder. Would you like to move it there?`,
  });
  if (response === 0) {
    try {
      const moved = app.moveToApplicationsFolder();
      if (moved) {
        // moveToApplicationsFolder relaunches from the new location;
        // explicitly quit this instance to ensure the old process exits.
        app.quit();
        return true;
      }
    } catch (err) {
      console.error('[App] Failed to move to Applications folder:', err);
    }
  }
  return false;
}

const startApp = async () => {
  const isQuitting = await promptMoveToApplicationsFolder();
  if (isQuitting) return;
  await initModules();
  handleProtocols();
  // Set up application menu (macOS menu bar)
  setupAppMenu();
  // Create system tray
  createTray();
  // Create the main window (skip if started in background)
  if (!wasStartedInBackground()) {
    createWindow();
  }
  // eagerlyConnectPeers();
  APP_RUNNING = true;

  // Check for updates after a delay (skip for Store distribution, respect user preference)
  if (!modules.config.IS_STORE_DISTRIBUTION) {
    setTimeout(() => {
      const localSc = modules.getLocalServiceController();
      const checkUpdates = localSc.app.getUserPreference(UserPreferences.CHECK_FOR_UPDATES);
      if (checkUpdates === false) {
        console.log('[App] Update check disabled by user preference.');
        return;
      }
      checkForUpdates().then(info => {
        if (info?.updateAvailable) {
          console.log(`Update available: ${info.latestVersion} (current: ${info.currentVersion})`);
        }
      });
    }, 10 * 60 * 1000); // 10 minutes
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {

  if (didAppCrash) {
    return;
  }

  try {
    await startApp();
  } catch (error) {
    console.error('[App] Error during app initialization:', error);
    showCrashDialogAndQuit(error instanceof Error ? error : new Error(String(error)));
  }

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && APP_RUNNING) {
      createWindow();
    }
  });
});

// Don't quit when all windows are closed - keep running in tray
app.on('window-all-closed', () => {
  // Do nothing - app stays in tray
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app', privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
    }
  },
]);
