import { app, BrowserWindow, safeStorage, protocol, dialog } from 'electron';
import path from 'node:path';
import env from './env';
import { handleProtocols } from './protocols';
import { DesktopConfigType } from './types';
import { setModules, ModulesType } from 'shared/modules';
import CryptoImpl from './cryptoImpl';
import DesktopServiceController from './services/desktopServiceController';
import fs from 'node:fs';
import os from 'node:os';
import DesktopConfigStorage from './configStorage';
import { OSType, UITheme } from 'shared/types';
import { createTray } from './tray';
import { createWindow } from './window';

require('@electron/remote/main').initialize();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('Another instance is running. Exiting...');
  app.quit()
}

console.log('Starting Electron app...');
console.log('Environment variables:', env);

const isDev = env.NODE_ENV === 'development';

// Use separate data directory for development
if (isDev) {
  app.setPath('userData', `${app.getPath('userData')}_DEV`);
}

const cryptoModule = new CryptoImpl();

function createOrGetSecretKey(dataDir: string) {
  const secretKeyPath = path.join(dataDir, "secret.key");
  if (!fs.existsSync(secretKeyPath)) {
    console.log("😼 Secret key not found. Creating a new one..");
    const secretKey = cryptoModule.generateRandomKey();
    const encrypted = safeStorage.encryptString(secretKey);
    fs.mkdirSync(path.dirname(secretKeyPath), { recursive: true });
    fs.writeFileSync(secretKeyPath, encrypted);
    console.log("✅ Secret key written to file:", secretKeyPath);
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
    console.log("🔑 Key pair not found. Generating a new one..");
    const { privateKey, publicKey } = await cryptoModule.generateKeyPair();
    const privateKeyEncrypted = safeStorage.encryptString(privateKey);
    const publicKeyEncrypted = safeStorage.encryptString(publicKey);
    fs.writeFileSync(privateKeyPath, privateKeyEncrypted);
    fs.writeFileSync(publicKeyPath, publicKeyEncrypted);
    console.log("✅ Key pair written to files:", privateKeyPath, publicKeyPath);
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

async function getConfig() {
  // Set the modules for the app
  const isPackaged = app.isPackaged;
  const dataDir = app.getPath('userData');
  const { privateKeyPem, publicKeyPem } = await getOrGenerateKeys(dataDir);
  const fingerprint = cryptoModule.getFingerprintFromPem(publicKeyPem);
  let uiTheme: UITheme = process.platform === 'darwin' ? UITheme.Macos : UITheme.Win11;
  if (!!env.UI_THEME) {
    if (env.UI_THEME === UITheme.Macos) {
      uiTheme = UITheme.Macos;
    } else if (env.UI_THEME === UITheme.Win11) {
      uiTheme = UITheme.Win11;
    } else {
      console.warn('Invalid UI_THEME value:', env.UI_THEME);
    }
  }
  const desktopConfig: DesktopConfigType = {
    IS_DESKTOP_PACKED: isPackaged,
    IS_DEV: isDev,
    USE_WEB_APP_SERVER: env.USE_WEB_APP_SERVER,
    SERVER_URL: env.SERVER_URL,
    WS_SERVER_URL: env.WS_SERVER_URL,
    DATA_DIR: dataDir,
    SECRET_KEY: createOrGetSecretKey(dataDir),
    VERSION: app.getVersion(),
    DEVICE_NAME: os.hostname(),
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

const startApp = async () => {
  await initModules();
  handleProtocols();
  // Create system tray
  createTray();
  // Create the main window (skip if started in background)
  if (!wasStartedInBackground()) {
    createWindow();
  }
  // eagerlyConnectPeers();
  APP_RUNNING = true;
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {

  try {
    await startApp();
  } catch (error) {
    console.error('Error during app initialization:', error);
    // Show error dialog and quit
    dialog.showErrorBox('Oh my my!', error.message || error);
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
