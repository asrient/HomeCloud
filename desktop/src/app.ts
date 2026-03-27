import { app, BrowserWindow, safeStorage, dialog, protocol, shell } from 'electron';
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
import { isAppContainerWin } from './appContainer';
import { createCrashReportLink } from 'shared/helpLinks';

const isDev = !!env && env.NODE_ENV === 'development';

const cryptoModule = new CryptoImpl();

export function isDevMode() {
  return isDev;
}

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
      const computerName = execSync('scutil --get ComputerName', { encoding: 'utf-8' }).trim();
      if (computerName) {
        return computerName;
      }
    } catch {
      // Fall back to parsed hostname if scutil fails
    }
    return parseHostname(os.hostname());
  }
  return os.hostname();
}

async function getConfig() {
  const isPackaged = app.isPackaged;
  const dataDir = app.getPath('userData');
  const cacheDir = path.join(app.getPath('temp'), app.getName());
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

export function isAppRunning() {
  return APP_RUNNING;
}

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
  setupAppMenu();
  createTray();
  if (!wasStartedInBackground()) {
    createWindow();
  }
  APP_RUNNING = true;

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
    }, 10 * 60 * 1000);
  }
}

let isInitialized = false;

export function initApp(getDidAppCrash: () => boolean) {
  if (isInitialized) {
    console.warn('[App] initApp called multiple times. Ignoring subsequent calls.');
    return;
  }
  isInitialized = true;
  console.log('[App] Starting Electron app...');
  console.log('[App] Version:', app.getVersion(), '| Electron:', process.versions.electron, '| Node:', process.versions.node, '| Platform:', process.platform, process.arch);

  if (isDev) {
    console.log('[App] Running in development mode.');
    app.setName(`${app.getName()}-dev`);
    app.setPath('userData', `${app.getPath('userData')}-dev`);
  }

  setupProtocols();

  app.whenReady().then(async () => {
    if (getDidAppCrash()) {
      return;
    }

    try {
      await startApp();
    } catch (error) {
      console.error('[App] Error during app initialization:', error);
      showCrashDialogAndQuit(error instanceof Error ? error : new Error(String(error)));
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && APP_RUNNING) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    // Do nothing - app stays in tray
  });
}

const setupProtocols = () => {
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
}

export const showCrashDialogAndQuit = (error: Error) => {
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
