import { app, BrowserWindow, protocol, net } from 'electron';
import path from 'path';
import { TabbedAppWindow } from './window';

export default class App {
  tabbedWindows: TabbedAppWindow[] = [];

  constructor() {
    // Handle creating/removing shortcuts on Windows when installing/uninstalling.
    if (require('electron-squirrel-startup')) {
      app.quit();
    }
    app.on('activate', this.appActivated);
    app.on('window-all-closed', this.allWindowsClosed);
    app.on('ready', this.appReady);
    
    protocol.registerSchemesAsPrivileged([
      { scheme: 'bundle', privileges: { bypassCSP: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
    ]);
  }

  createTabbedWindow() {
    const win = new TabbedAppWindow();
    this.tabbedWindows.push(win);
  }

  registerBundleProtocol() {
    // Customize protocol to handle bundle resource.
    protocol.handle('bundle', (request) => {
      let fileUrl = request.url.replace('bundle://index.html', '');
      if (fileUrl === '/') {
        fileUrl = '/index.html';
      }
      if (fileUrl[fileUrl.length - 1] === '/') {
        fileUrl = fileUrl.substring(0, fileUrl.length - 1);
      }
      //console.log('fileUrl', fileUrl);
      //console.log('app.getAppPath()', app.getAppPath());
      const filePath = path.join(app.getAppPath(), 'bin/web', fileUrl);
      //console.log('filePath', filePath);
      return net.fetch('file://' + filePath);
    });
  }

  appReady = () => {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    this.registerBundleProtocol();
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