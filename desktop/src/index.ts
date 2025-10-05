import { app, BrowserWindow, safeStorage, protocol, net, nativeTheme } from 'electron';
import path from 'node:path';
import env from './env';
import { DesktopConfigType } from './types';
import { setModules, ModulesType } from 'shared/modules';
import CryptoImpl from './cryptoImpl';
import DesktopServiceController from './services/desktopServiceController';
import fs from 'node:fs';
import os from 'node:os';
import DesktopConfigStorage from './configStorage';
import { getServiceController } from 'shared/utils';
import { UITheme } from 'shared/types';

const WEB_APP_SERVER = 'http://localhost:3000';

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
  let uiTheme: UITheme =  process.platform === 'darwin' ? UITheme.Macos : UITheme.Win11;
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
    IS_DEV: env.NODE_ENV === 'development',
    USE_WEB_APP_SERVER: env.USE_WEB_APP_SERVER,
    DATA_DIR: dataDir,
    SECRET_KEY: createOrGetSecretKey(dataDir),
    VERSION: app.getVersion(),
    DEVICE_NAME: os.hostname(),
    PUBLIC_KEY_PEM: publicKeyPem,
    PRIVATE_KEY_PEM: privateKeyPem,
    FINGERPRINT: fingerprint,
    APP_NAME: app.getName(),
    UI_THEME: uiTheme,
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
    }
  };
  setModules(modules, global);
  const serviceController = DesktopServiceController.getLocalInstance<DesktopServiceController>();
  serviceController.setup();
}

function shouldShowDevTools() {
  return modules.config.IS_DEV && !(modules.config as DesktopConfigType).IS_DESKTOP_PACKED;
}

const createWindow = () => {
  // Create the browser window.
  const isSystemDarkMode = nativeTheme.shouldUseDarkColors;
  console.log('System dark mode:', isSystemDarkMode);
  const mainWindow = new BrowserWindow({
    width: process.platform === 'darwin' ? 950 : 1200,
    height: process.platform === 'darwin' ? 600 : 860,
    minWidth: 900,
    minHeight: 600,
    // remove the default titlebar
    titleBarStyle: 'hidden',
    backgroundMaterial: 'mica',
    vibrancy: 'titlebar',
    trafficLightPosition: { x: 20, y: 20 },
    // expose window controls in Windows/Linux
    ...(process.platform !== 'darwin' ? {
      titleBarOverlay: {
        // make controls transparent
        color: '#00000000',
        // make symbol color white if the system is dark mode
        symbolColor: isSystemDarkMode ? '#ffffff' : '#000000',
      }
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: false, // Disable context isolation for remote module
    },
  });

  require("@electron/remote/main").enable(mainWindow.webContents);
  // and load the index.html of the app.
  if ((modules.config as DesktopConfigType).USE_WEB_APP_SERVER) {
    console.log('Loading web app from server:', WEB_APP_SERVER);
    mainWindow.loadURL(`${WEB_APP_SERVER}?back=off`);
  } else {
    // Load the app from the local assets/web directory
    mainWindow.loadURL(`app://-/index.html?back=off`);
  }

  // Open the DevTools.
  if (shouldShowDevTools()) {
    mainWindow.webContents.openDevTools();
  }
};

async function handleMediaRequest(request: Request): Promise<GlobalResponse> {
  const urlObj = new URL(request.url);
  if (urlObj.pathname === '/previewFile') {
    // Handle preview file request
    let fingerprint = urlObj.searchParams.get('fingerprint') || null;
    if (fingerprint === 'null') {
      fingerprint = null; // Convert 'null' string to actual null
    }
    const path = urlObj.searchParams.get('path') || '';
    console.log('Handling media preview request:', { fingerprint, path });
    const serviceController = await getServiceController(fingerprint);
    const { name, mime, stream } = await serviceController.files.fs.readFile(path);
    if (!stream) {
      throw new Error(`File not found: ${path}`);
    }
    const response: GlobalResponse = new Response(stream, {
      headers: {
        'Content-Type': mime || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${name}"`,
        'Cache-Control': '604800', // 7 days
      },
    });
    return response;
  }
  throw new Error(`Unsupported media request: ${request.url}`);
}

function handleProtocols() {
  // Register a custom protocol to serve files from assets/web
  protocol.handle('app', async (request) => {
    if (request.url.startsWith('app://media')) {
      // Handle media requests
      return handleMediaRequest(request);
    }
    let url = request.url.replace('app://-', '');
    // Ensure the URL is safe and does not contain any path traversal characters
    if (url.includes('..') || url.includes('~')) {
      throw new Error('Invalid URL');
    }
    // add .html if URL does not point to a file
    const ext = path.extname(url);
    if (ext === '') {
      url += '.html';
    }
    // Construct the file path
    const filePath = path.join(__dirname, '../assets/web', url);
    // Check if the file exists
    try {
      fs.promises.access(filePath);
    }
    catch (error) {
      console.error('File not found:', filePath);
      throw new Error(`File not found: ${filePath}`);
    }
    return net.fetch(`file://${filePath}`)
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  await initModules();
  // console.log('Modules initialized:', global.modules);
  handleProtocols();
  // Create the main window
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
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
