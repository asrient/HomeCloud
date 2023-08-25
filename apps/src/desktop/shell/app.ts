import { app, BrowserWindow, protocol, net } from 'electron';
import AppProtocol from './appProtocol';
import { TabbedAppWindow } from './window';
import { setDevMode, setEnvType, setDataDir, EnvType } from '../../backend/config';
import isDev from "electron-is-dev";

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
    this.appProtocol = new AppProtocol();
  }

  setupConfig() {
    setDevMode(isDev);
    setEnvType(EnvType.Desktop);
    setDataDir(app.getPath('userData'));
  }

  createTabbedWindow() {
    const win = new TabbedAppWindow();
    this.tabbedWindows.push(win);
  }

  appReady = () => {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
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