import { app, BrowserWindow } from 'electron';
import path from 'path';
import AppProtocol from './appProtocol';
import { TabbedAppWindow } from './window';
import { setupEnvConfig, EnvType, envConfig } from '../../backend/envConfig';
import isDev from "electron-is-dev";
import { handleServerEvent, ServerEvent } from '../../backend/serverEvent';
import { initDb } from '../../backend/db';

export default class App {
  tabbedWindows: TabbedAppWindow[] = [];
  appProtocol: AppProtocol;

  constructor() {
    // Handle creating/removing shortcuts on Windows when installing/uninstalling.
    if (require('electron-squirrel-startup')) {
      app.quit();
    }
    this.setupConfig();
    app.on('activate', this.appActivated);
    app.on('window-all-closed', this.allWindowsClosed);
    app.on('ready', this.appReady);
    handleServerEvent(this.handleServerEvent);
    this.appProtocol = new AppProtocol();
  }

  handleServerEvent = async (event: ServerEvent) => {
    console.log('handleServerEvent', event);
    // todo: check profileId as well
    const { type, data } = event;
    this.tabbedWindows.forEach(w => {
      w.pushServerEvent(type, data);
    });
    return true;
  }

  setupConfig() {
    setupEnvConfig({
      isDev,
      envType: EnvType.Desktop,
      dataDir: app.getPath('userData'),
      baseUrl: isDev ? 'http://localhost:3000/' : AppProtocol.BUNDLE_BASE_URL,
      apiBaseUrl: AppProtocol.API_BASE_URL,
      webBuildDir: path.join(app.getAppPath(), 'bin/web'),
    });
  }

  createTabbedWindow() {
    const win = new TabbedAppWindow();
    this.tabbedWindows.push(win);
  }

  connectDb = async () => {
    const dataDir = envConfig.DATA_DIR;
    const dbPath = path.join(dataDir, 'homecloud.db');
    if (!await initDb('sqlite', dbPath)) {
      console.error('❌ Failed to initialize database.');
      return false;
    }
    return true;
  }

  appReady = async () => {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    if(!await this.connectDb()) {
      app.quit();
      return;
    }
    this.appProtocol.register();
    this.createTabbedWindow();
  }

  appActivated = () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      this.createTabbedWindow();
    }
  }

  allWindowsClosed = () => {
    // Quit when all windows are closed, except on macOS. There, it's common
    // for applications and their menu bar to stay active until the user quits
    // explicitly with Cmd + Q.
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }
}
