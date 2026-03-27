import { app } from 'electron';
import log from 'electron-log/main';
import { initApp, showCrashDialogAndQuit, isDevMode, isAppRunning } from './app';
import { isAppContainerWin } from './appContainer';
import { getOrCreateWindow } from './window';

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

log.transports.file.level = isDevMode() ? 'silly' : 'info';
log.transports.console.level = isDevMode() ? 'silly' : 'info';

console.log('[App] Logger initialized.');

Object.assign(console, log.functions);


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
else {
  app.on('second-instance', () => {
    console.log('[App] Second instance detected, showing window...');
    if (!isAppRunning()) {
      console.log('[App] App is not running yet, skipping window focus.');
      return;
    }
    getOrCreateWindow();
  });

  initApp(() => didAppCrash);
}
