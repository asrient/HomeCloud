import { app, BrowserWindow, protocol, net, BrowserView } from 'electron';
import path from 'path';
import isDev from "electron-is-dev";

console.log('isDev', isDev);
const headerHeight = 90;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'bundle', privileges: { bypassCSP: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

const createTab = (parent: BrowserWindow) => {
  const parentBounds = parent.getBounds();
  console.log('parentBounds', parentBounds);
  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  parent.setBrowserView(view);
  
  view.setBounds({ x: 0, y: headerHeight, width: parentBounds.width, height: (parentBounds.height - headerHeight) });
  view.webContents.loadURL('bundle://index.html');
  view.webContents.openDevTools();

  // https://github.com/electron/electron/issues/22174
  let lastHandle: NodeJS.Timeout | null = null;
  const handleWindowResize = (e: any) => {
    e.preventDefault();
    // the setTimeout is necessary because it runs after the event listener is handled
    lastHandle = setTimeout(() => {
      if (lastHandle != null) clearTimeout(lastHandle);
      const updatedParentBounds = parent.getBounds();
      view.setBounds({ x: 0, y: headerHeight, width: updatedParentBounds.width, height: (updatedParentBounds.height - headerHeight) });
    });
  };

  parent.on("resize", handleWindowResize);
};

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'public/header-preload.js'),
    },
  });
  mainWindow.webContents.loadFile(path.join(__dirname, 'public/app-header.html'));
  createTab(mainWindow);
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  // Customize protocol to handle bundle resource.
  protocol.handle('bundle', (request) => {
    let fileUrl = request.url.replace('bundle://index.html', '');
    if (fileUrl === '/') {
      fileUrl = '/index.html';
    }
    if (fileUrl[fileUrl.length - 1] === '/') {
      fileUrl = fileUrl.substring(0, fileUrl.length - 1);
    }
    console.log('fileUrl', fileUrl);
    console.log('app.getAppPath()', app.getAppPath());
    const filePath = path.join(app.getAppPath(), 'bin/web', fileUrl);
    console.log('filePath', filePath);
    return net.fetch('file://' + filePath);
  });

  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
